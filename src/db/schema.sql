CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK(mode IN ('mcp','guided','direct')),
  llm_provider TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_results TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sequence INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id),
  llm_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_logs(session_id);
