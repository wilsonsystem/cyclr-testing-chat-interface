export type Bindings = {
  DB: D1Database;
};

export type AppEnv = {
  Bindings: Bindings;
};

export type ChatMode = 'mcp' | 'guided' | 'direct';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatSession {
  id: string;
  mode: ChatMode;
  llm_provider: string;
  created_at: string;
  updated_at: string;
  is_active: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tool_calls: string | null;
  tool_results: string | null;
  created_at: string;
  sequence: number;
}

export interface UsageLog {
  id: string;
  session_id: string;
  message_id: string | null;
  llm_provider: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  created_at: string;
}

export interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

export interface ChatRequest {
  session_id: string;
  message: string;
  mode: ChatMode;
}

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface UsageData {
  input_tokens: number;
  output_tokens: number;
  model_name: string;
}

export interface QuickBooksMethod {
  id: number;
  name: string;
  description: string;
  category: string;
  methodType: string;
}
