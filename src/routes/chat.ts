import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { AppEnv, ChatRequest, LLMMessage, ConfigMode } from '../types';
import { getConfig, getModeConfig } from '../services/config';
import { streamChat, estimateCost, type LLMTool } from '../services/llm';
import { connectMCP, mcpToolsToLLMTools } from '../services/mcp-client';
import { logUsage } from '../services/usage-logger';

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.post('/', async (c) => {
  const body = await c.req.json<ChatRequest>();
  if (!body.message || !body.session_id) {
    return c.json({ error: 'message and session_id are required' }, 400);
  }

  const configMode = body.config_mode ?? 'a';
  const fullConfig = await getConfig(c.env.DB);
  const modeConfig = getModeConfig(fullConfig, configMode);

  const provider = modeConfig.llm_provider as 'openai' | 'anthropic' | undefined;
  const apiKey = modeConfig.llm_api_key;
  const selectedModel = modeConfig.llm_model || undefined;
  const toolSource = modeConfig.tool_source || 'mcp';
  const systemPrompt = modeConfig.system_prompt || undefined;

  if (!provider || !apiKey) {
    return c.json({ error: `Mode ${configMode.toUpperCase()}: LLM provider and API key must be configured in Setup` }, 422);
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
  const mode = toolSource === 'direct' ? 'direct' : 'mcp';
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

  // Determine tools based on tool_source setting
  let tools: LLMTool[] = [];
  const noopCallTool = async (_name: string, _args: Record<string, unknown>) => 'No tools configured';

  if (toolSource === 'mcp') {
    const mcpUrls = modeConfig.mcp_server_urls;
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
        return c.json({
          error: `MCP server connection failed: ${e instanceof Error ? e.message : String(e)}. Please check the MCP URL in Setup.`
        }, 422);
      }
    }

    // No MCP URL — plain chat
    return streamSSE(c, async (stream) => {
      await handleStreamWithTools(
        stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, [], noopCallTool, sequence
      );
    });
  }

  if (toolSource === 'direct') {
    const { getCyclrToolsForLLM, handleCyclrToolCall } = await import('../services/cyclr-tools');

    const cyclrConfig = {
      accountId: modeConfig.cyclr_account_id,
      clientId: modeConfig.cyclr_client_id,
      clientSecret: modeConfig.cyclr_client_secret,
      connectorId: modeConfig.cyclr_connector_id || '88534',
      bearerToken: modeConfig.cyclr_bearer_token,
      tokenExpiresAt: modeConfig.cyclr_token_expires_at,
    };

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

    // No Cyclr credentials — plain chat
    return streamSSE(c, async (stream) => {
      await handleStreamWithTools(
        stream, c.env.DB, body.session_id, provider, apiKey, selectedModel, messages, systemPrompt, [], noopCallTool, sequence
      );
    });
  }

  // Fallback — plain chat
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
  const maxToolRounds = tools.length > 0 ? 4 : 0;
  let toolRound = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastModelName = '';

  // Loop: tool rounds + 1 final text round
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // On the final round (after max tool rounds), send without tools to force text output
    const useTools = toolRound < maxToolRounds ? tools : [];
    let hasToolCalls = false;
    const pendingToolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

    for await (const event of streamChat({ provider, apiKey, model }, currentMessages, systemPrompt, useTools)) {
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

    if (!hasToolCalls) break;
    toolRound++;

    for (const tc of pendingToolCalls) {
      try {
        let result = await callTool(tc.name, tc.arguments);
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
