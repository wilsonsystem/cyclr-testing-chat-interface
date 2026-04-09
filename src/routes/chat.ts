import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv, ChatRequest, LLMMessage } from '../types';
import { getConfig } from '../services/config';
import { streamChat, estimateCost, type LLMTool } from '../services/llm';
import { connectMCP, mcpToolsToLLMTools } from '../services/mcp-client';
import { logUsage } from '../services/usage-logger';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post('/', async (c) => {
  const body = await c.req.json<ChatRequest>();
  if (!body.message || !body.session_id) {
    return c.json({ error: 'message and session_id are required' }, 400);
  }

  const mode = body.mode ?? 'mcp';
  const config = await getConfig(c.env.DB);
  const provider = config.llm_provider as 'openai' | 'anthropic' | undefined;
  const apiKey = config.llm_api_key;
  const selectedModel = config.llm_model || undefined;

  if (!provider || !apiKey) {
    return c.json({ error: 'LLM provider and API key must be configured in Setup' }, 422);
  }

  // Save user message to DB
  const userMsgId = crypto.randomUUID();
  const { results: existingMsgs } = await c.env.DB
    .prepare('SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?')
    .bind(body.session_id)
    .all<{ cnt: number }>();
  const sequence = (existingMsgs[0]?.cnt ?? 0) + 1;

  await c.env.DB
    .prepare('INSERT INTO messages (id, session_id, role, content, created_at, sequence) VALUES (?, ?, ?, ?, datetime(\'now\'), ?)')
    .bind(userMsgId, body.session_id, 'user', body.message, sequence)
    .run();

  // Update session with provider and mode
  await c.env.DB
    .prepare('UPDATE chat_sessions SET llm_provider = ?, mode = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .bind(provider, mode, body.session_id)
    .run();

  // Build conversation history (last 20 messages to limit token usage)
  const { results: history } = await c.env.DB
    .prepare('SELECT role, content FROM messages WHERE session_id = ? AND role IN (\'user\', \'assistant\') ORDER BY sequence DESC LIMIT 20')
    .bind(body.session_id)
    .all<{ role: string; content: string }>();

  const messages: LLMMessage[] = history.reverse().map((m) => ({
    role: m.role as LLMMessage['role'],
    content: m.content,
  }));

  // Determine tools and system prompt based on mode
  let tools: LLMTool[] = [];
  let systemPrompt: string | undefined;

  // No-op tool caller for plain chat (no tools)
  const noopCallTool = async (_name: string, _args: Record<string, unknown>) => 'No tools configured';

  if (mode === 'mcp' || mode === 'guided') {
    const mcpUrls = config.mcp_server_urls;

    if (mode === 'guided') {
      systemPrompt = config.system_prompt_guided || undefined;
    }

    // If MCP server is configured, connect and use tools
    if (mcpUrls && mcpUrls.trim()) {
      try {
        const mcpClient = await connectMCP(mcpUrls.split('\n')[0].trim());
        tools = mcpToolsToLLMTools(mcpClient.tools);

        return streamSSE(c, async (stream) => {
          await handleStreamWithTools(
            stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, tools, mcpClient.callTool, sequence
          );
        });
      } catch (e: unknown) {
        // MCP unreachable — tell the user instead of silently falling back
        return c.json({
          error: `MCP server connection failed: ${e instanceof Error ? e.message : String(e)}. Please check the MCP URL in Setup (Part 2) — the token may have expired.`
        }, 422);
      }
    }

    // No MCP URL configured — plain chat
    return streamSSE(c, async (stream) => {
      await handleStreamWithTools(
        stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, [], noopCallTool, sequence
      );
    });
  }

  if (mode === 'direct') {
    const { getCyclrToolsForLLM, handleCyclrToolCall } = await import('../services/cyclr-tools');
    systemPrompt = config.system_prompt_direct || undefined;

    const cyclrConfig = {
      accountId: config.cyclr_account_id,
      clientId: config.cyclr_client_id,
      clientSecret: config.cyclr_client_secret,
      connectorId: config.cyclr_connector_id || '88534',
      bearerToken: config.cyclr_bearer_token,
      tokenExpiresAt: config.cyclr_token_expires_at,
    };

    // If Cyclr credentials are configured, use Cyclr tools
    if (cyclrConfig.accountId && cyclrConfig.clientId && cyclrConfig.clientSecret) {
      tools = getCyclrToolsForLLM();

      return streamSSE(c, async (stream) => {
        const callTool = async (name: string, args: Record<string, unknown>) => {
          return handleCyclrToolCall(name, args, cyclrConfig, c.env.DB);
        };
        await handleStreamWithTools(
          stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, tools, callTool, sequence
        );
      });
    }

    // Plain chat (no Cyclr tools)
    return streamSSE(c, async (stream) => {
      await handleStreamWithTools(
        stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, [], noopCallTool, sequence
      );
    });
  }

  // Fallback — plain chat for any mode
  return streamSSE(c, async (stream) => {
    await handleStreamWithTools(
      stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, [], noopCallTool, sequence
    );
  });
});

async function handleStreamWithTools(
  stream: { writeSSE: (data: { event: string; data: string }) => Promise<void> },
  db: D1Database,
  sessionId: string,
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string | undefined,
  messages: LLMMessage[],
  systemPrompt: string | undefined,
  tools: LLMTool[],
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>,
  startSequence: number
): Promise<void> {
  let fullContent = '';
  let currentMessages = [...messages];
  let sequence = startSequence;
  // Only allow tool-use loop if tools are actually provided; max 3 iterations
  // (1: LLM calls tools, 2: LLM processes results + may call more, 3: LLM generates final text)
  const maxIterations = tools.length > 0 ? 3 : 1;
  let iteration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModelName = '';

  while (iteration < maxIterations) {
    iteration++;
    let hasToolCalls = false;
    const pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    for await (const event of streamChat({ provider, apiKey, model }, currentMessages, systemPrompt, tools)) {
      if (event.type === 'token' && event.content) {
        fullContent += event.content;
        await stream.writeSSE({ event: 'token', data: JSON.stringify({ content: event.content, done: false }) });
      }

      if (event.type === 'tool_call' && event.tool_call) {
        hasToolCalls = true;
        pendingToolCalls.push(event.tool_call);
        await stream.writeSSE({
          event: 'tool_call',
          data: JSON.stringify({ tool: event.tool_call.name, args: event.tool_call.arguments }),
        });
      }

      if (event.type === 'usage' && event.usage) {
        totalInputTokens += event.usage.input_tokens;
        totalOutputTokens += event.usage.output_tokens;
        lastModelName = event.usage.model_name;
      }

      if (event.type === 'error' && event.error) {
        await stream.writeSSE({ event: 'token', data: JSON.stringify({ content: `\nError: ${event.error}`, done: false }) });
      }
    }

    if (!hasToolCalls) {
      break;
    }

    // Execute tool calls and feed results back (truncate large results to save tokens)
    for (const tc of pendingToolCalls) {
      try {
        let result = await callTool(tc.name, tc.arguments);
        // Truncate very large tool results to prevent token explosion
        if (result.length > 40000) {
          result = result.slice(0, 40000) + '\n... [truncated, showing partial results]';
        }
        await stream.writeSSE({
          event: 'tool_result',
          data: JSON.stringify({ tool: tc.name, result }),
        });

        currentMessages.push({ role: 'assistant', content: fullContent || `Calling tool: ${tc.name}` });
        currentMessages.push({ role: 'user', content: `Tool result for ${tc.name}: ${result}` });
      } catch (e: unknown) {
        await stream.writeSSE({
          event: 'tool_result',
          data: JSON.stringify({ tool: tc.name, error: String(e) }),
        });
        currentMessages.push({ role: 'assistant', content: fullContent || `Calling tool: ${tc.name}` });
        currentMessages.push({ role: 'user', content: `Tool error for ${tc.name}: ${String(e).slice(0, 500)}` });
      }
    }

    fullContent = '';
  }

  // Send aggregated usage once at the end
  if (lastModelName) {
    const cost = estimateCost(lastModelName, totalInputTokens, totalOutputTokens);
    await stream.writeSSE({
      event: 'usage',
      data: JSON.stringify({
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        estimated_cost_usd: cost,
      }),
    });

    // Save assistant message and log usage
    const msgId = crypto.randomUUID();
    sequence++;
    await db
      .prepare('INSERT INTO messages (id, session_id, role, content, created_at, sequence) VALUES (?, ?, ?, ?, datetime(\'now\'), ?)')
      .bind(msgId, sessionId, 'assistant', fullContent, sequence)
      .run();

    await logUsage(db, sessionId, msgId, provider, {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      model_name: lastModelName,
    });
  }

  await stream.writeSSE({ event: 'done', data: JSON.stringify({ message_id: crypto.randomUUID() }) });
}
