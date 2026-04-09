# Data Model: Multi-LLM Chat Platform

**Branch**: `001-multi-llm-chat-platform`
**Date**: 2026-04-02
**Storage**: Cloudflare D1 (SQLite-compatible)

## Entity Relationship Overview

```
Configuration (1) ──── stored per-key in config table
ChatSession (1) ──┬── (many) Messages
                  └── (many) UsageLogs
```

## Entities

### 1. Configuration

Stores user-defined settings. Key-value design allows flexible config without schema changes.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| key | TEXT | PRIMARY KEY | Config identifier (e.g., `llm_provider`, `api_key`, `mcp_server_url`) |
| value | TEXT | NOT NULL | Config value (encrypted for secrets) |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |

**Config keys**:
- `llm_provider` — "openai" or "anthropic"
- `llm_api_key` — Provider API key
- `mcp_server_urls` — JSON array of MCP server URLs
- `system_prompt_guided` — System prompt for Mode II
- `system_prompt_direct` — System prompt/instructions for Mode III
- `cyclr_account_id` — X-Cyclr Account ID
- `cyclr_client_id` — Cyclr Client ID
- `cyclr_client_secret` — Cyclr Client Secret
- `cyclr_connector_id` — Selected connector ID (default: "88534")
- `cyclr_bearer_token` — Cached bearer token
- `cyclr_token_expires_at` — Token expiry timestamp

### 2. ChatSession

Represents a conversation between the user and an LLM.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| mode | TEXT | NOT NULL, CHECK(mode IN ('mcp','guided','direct')) | Interaction mode |
| llm_provider | TEXT | NOT NULL | Provider used ("openai" or "anthropic") |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL | ISO 8601 timestamp |
| is_active | INTEGER | NOT NULL DEFAULT 1 | 1 = active, 0 = ended/cleared |

### 3. Message

An individual input or output within a session.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | NOT NULL, FK → ChatSession.id | Parent session |
| role | TEXT | NOT NULL, CHECK(role IN ('user','assistant','system','tool')) | Message role |
| content | TEXT | NOT NULL | Message content |
| tool_calls | TEXT | NULL | JSON array of tool calls (if any) |
| tool_results | TEXT | NULL | JSON array of tool results (if any) |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |
| sequence | INTEGER | NOT NULL | Order within session |

### 4. UsageLog

Tracks token consumption and cost per message exchange.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | UUID |
| session_id | TEXT | NOT NULL, FK → ChatSession.id | Parent session |
| message_id | TEXT | NULL, FK → Message.id | Associated assistant message |
| llm_provider | TEXT | NOT NULL | Provider used |
| model_name | TEXT | NOT NULL | Specific model (e.g., "claude-sonnet-4-20250514") |
| input_tokens | INTEGER | NOT NULL DEFAULT 0 | Prompt tokens consumed |
| output_tokens | INTEGER | NOT NULL DEFAULT 0 | Completion tokens consumed |
| estimated_cost_usd | REAL | NOT NULL DEFAULT 0.0 | Estimated cost in USD |
| created_at | TEXT | NOT NULL | ISO 8601 timestamp |

## D1 Schema (SQL)

```sql
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
```

## Validation Rules

- `config.key` must be from the known set of config keys
- `config.value` for API keys and secrets must be non-empty when saving
- `chat_sessions.mode` must match one of the three defined modes
- `messages.sequence` must be monotonically increasing within a session
- `usage_logs.input_tokens` and `output_tokens` must be >= 0
- `usage_logs.estimated_cost_usd` must be >= 0.0

## State Transitions

### ChatSession Lifecycle

```
Created (is_active=1)
  │
  ├── Messages exchanged (mode can change between messages)
  │
  ├── User clicks "New Chat" → is_active=0, new session created
  │
  └── User clicks "Clear/Reset" → is_active=0, all messages deleted (cascade)
```

### Cyclr Token Lifecycle

```
No token → User tests connection → Token generated + cached
  │
  ├── Token valid → Use for API calls
  │
  └── Token expired / 401 → Regenerate automatically → Retry call
```
