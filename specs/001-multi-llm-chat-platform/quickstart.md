# Quickstart: Multi-LLM Chat Platform

**Branch**: `001-multi-llm-chat-platform`
**Date**: 2026-04-02

## Prerequisites

- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account (free tier sufficient for development)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create D1 database

```bash
wrangler d1 create cyclr-chat-db
```

Copy the `database_id` from the output into `wrangler.toml`.

### 3. Apply database schema

```bash
# Local development
wrangler d1 execute cyclr-chat-db --local --file=src/db/schema.sql

# Production
wrangler d1 execute cyclr-chat-db --file=src/db/schema.sql
```

### 4. Run locally

```bash
wrangler dev
```

Open `http://localhost:8787` in your browser.

### 5. Deploy

```bash
wrangler deploy
```

## First Use

1. Open the app in your browser
2. Click **Setup** (right-hand side)
3. **Part 1 — Model**: Select "Anthropic", enter your API key, click "Test Connection"
4. **Part 2 — MCP**: Enter your MCP server URL(s)
5. **Part 3 — System Prompt**: Enter a system prompt for guided mode
6. **Part 4 — Direct API**: Enter Cyclr credentials, click "Test Connection", select QuickBooks connector
7. Go back to chat, select a mode, and start chatting

## Development

### Local D1

`wrangler dev` automatically provisions a local D1 SQLite database. Data persists in `.wrangler/state/`.

### Mock LLM responses

During development, set the config key `llm_provider` to `mock` to return predefined responses without calling LLM APIs. This avoids token costs per the development guidelines.

### File structure

```
src/index.ts          — App entry point
src/routes/           — API route handlers
src/services/         — Business logic (LLM, MCP, Cyclr)
src/frontend/         — Static HTML/CSS/JS
src/db/schema.sql     — Database schema
wrangler.toml         — Workers configuration
```

## Verification Checklist

- [ ] `wrangler dev` starts without errors
- [ ] `http://localhost:8787` loads the chat interface
- [ ] Setup page is accessible via Setup button
- [ ] Test Connection works for LLM provider
- [ ] Test Connection works for Cyclr API
- [ ] Sending a message in Mode I returns a response (with MCP server configured)
- [ ] Session logs show token usage
- [ ] New Chat creates a fresh session
- [ ] `wrangler deploy` succeeds
