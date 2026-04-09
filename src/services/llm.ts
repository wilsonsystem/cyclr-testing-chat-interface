import type { LLMMessage, ToolCall, UsageData } from '../types';

export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Recursively sanitize property keys in a JSON schema to match Anthropic's pattern ^[a-zA-Z0-9_.-]{1,64}$ */
function sanitizeSchemaKeys(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[safeKey] = sanitizeSchemaKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[safeKey] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? sanitizeSchemaKeys(item as Record<string, unknown>)
          : item
      );
    } else {
      result[safeKey] = value;
    }
  }
  return result;
}

export interface LLMStreamEvent {
  type: 'token' | 'tool_call' | 'usage' | 'done' | 'error';
  content?: string;
  tool_call?: ToolCall;
  usage?: UsageData;
  error?: string;
}

interface LLMProviderConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4.1',
  anthropic: 'claude-sonnet-4-6',
};

const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 0.002, output: 0.008 },
  'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
  'o3': { input: 0.002, output: 0.008 },
  'o4-mini': { input: 0.0011, output: 0.0044 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-opus-4-6': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-opus-4-20250514': { input: 0.015, output: 0.075 },
  'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1K[model] ?? { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;
}

export async function testLLMConnection(
  provider: string,
  apiKey: string
): Promise<{ ok: boolean; model: string; error?: string }> {
  const model = DEFAULT_MODELS[provider] ?? DEFAULT_MODELS.anthropic;
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, model, error: body };
      }
      return { ok: true, model };
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, model, error: body };
      }
      return { ok: true, model };
    }
  } catch (e: unknown) {
    return { ok: false, model, error: String(e) };
  }
}

export async function* streamChat(
  config: LLMProviderConfig,
  messages: LLMMessage[],
  systemPrompt?: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMStreamEvent> {
  const model = config.model ?? DEFAULT_MODELS[config.provider];

  if (config.provider === 'anthropic') {
    yield* streamAnthropic(config.apiKey, model, messages, systemPrompt, tools);
  } else {
    yield* streamOpenAI(config.apiKey, model, messages, systemPrompt, tools);
  }
}

async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  systemPrompt?: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMStreamEvent> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    stream: true,
    messages: messages.map((m) => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
  };
  if (systemPrompt) body.system = systemPrompt;
  if (tools && tools.length > 0) {
    const invalidKeyPattern = /[^a-zA-Z0-9_.-]/;
    body.tools = tools.map((t, i) => {
      const sanitized = sanitizeSchemaKeys(t.input_schema);
      // Log any tools that had invalid property keys before sanitization
      const rawProps = (t.input_schema as { properties?: Record<string, unknown> }).properties;
      if (rawProps) {
        for (const key of Object.keys(rawProps)) {
          if (invalidKeyPattern.test(key) || key.length > 64) {
            console.warn(`[LLM] Tool ${i} "${t.name}" has invalid property key: "${key}"`);
          }
        }
      }
      return {
        name: t.name,
        description: t.description,
        input_schema: sanitized,
      };
    });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    yield { type: 'error', error: `Anthropic API error ${res.status}: ${errText}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let currentToolName = '';
  let currentToolId = '';
  let currentToolInput = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens ?? 0;
        }
        if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = '';
          }
        }
        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            yield { type: 'token', content: event.delta.text };
          }
          if (event.delta?.type === 'input_json_delta') {
            currentToolInput += event.delta.partial_json;
          }
        }
        if (event.type === 'content_block_stop' && currentToolName) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(currentToolInput); } catch {}
          yield {
            type: 'tool_call',
            tool_call: { id: currentToolId, name: currentToolName, arguments: args },
          };
          currentToolName = '';
          currentToolId = '';
          currentToolInput = '';
        }
        if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens ?? 0;
        }
      } catch {}
    }
  }

  yield {
    type: 'usage',
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, model_name: model },
  };
  yield { type: 'done' };
}

async function* streamOpenAI(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  systemPrompt?: string,
  tools?: LLMTool[]
): AsyncGenerator<LLMStreamEvent> {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const body: Record<string, unknown> = {
    model,
    stream: true,
    stream_options: { include_usage: true },
    messages: allMessages,
  };
  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    yield { type: 'error', error: `OpenAI API error ${res.status}: ${errText}` };
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        const delta = event.choices?.[0]?.delta;

        if (delta?.content) {
          yield { type: 'token', content: delta.content };
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCalls.get(tc.index) ?? { id: '', name: '', args: '' };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.args += tc.function.arguments;
            toolCalls.set(tc.index, existing);
          }
        }

        if (event.usage) {
          inputTokens = event.usage.prompt_tokens ?? 0;
          outputTokens = event.usage.completion_tokens ?? 0;
        }
      } catch {}
    }
  }

  for (const [, tc] of toolCalls) {
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(tc.args); } catch {}
    yield {
      type: 'tool_call',
      tool_call: { id: tc.id, name: tc.name, arguments: args },
    };
  }

  yield {
    type: 'usage',
    usage: { input_tokens: inputTokens, output_tokens: outputTokens, model_name: model },
  };
  yield { type: 'done' };
}
