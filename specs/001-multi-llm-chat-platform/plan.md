# Implementation Plan: Multi-LLM Chat Platform

**Branch**: `001-multi-llm-chat-platform` | **Date**: 2026-04-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-multi-llm-chat-platform/spec.md`

## Summary

Build a lightweight chat platform on Cloudflare Workers using Hono that lets users interact with OpenAI or Anthropic LLMs through three modes: MCP-based tool integration (Mode I), MCP with guided system prompts (Mode II), and direct Cyclr API calls (Mode III). The frontend is a single-page HTML/JS interface served from Workers. Configuration, sessions, and usage logs are stored in Cloudflare D1. All 260 QuickBooks methods (42 categories) are supported for Mode III via Cyclr Data on Demand.

## Technical Context

**Language/Version**: TypeScript (ES2022 target, Cloudflare Workers runtime)
**Primary Dependencies**: Hono (web framework), @anthropic-ai/sdk and openai SDK (LLM clients), @modelcontextprotocol/sdk (MCP client), Shadcn MCP (UI component tool server)
**Storage**: Cloudflare D1 (SQLite-compatible)
**Testing**: Vitest with miniflare (Cloudflare Workers test environment)
**Target Platform**: Cloudflare Workers (V8 isolate, edge runtime)
**Project Type**: Web service (API + static frontend)
**Performance Goals**: Chat response initiation < 2s, full page load < 1s
**Constraints**: Workers CPU time limits (30s paid plan), no Node.js APIs, no filesystem, D1 row size limits
**Scale/Scope**: Single concurrent user baseline, ~5 pages (chat + setup), 260 QuickBooks methods across 42 categories

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Lightweight by Default | PASS | Hono is ~14KB, minimal dependencies. Native Web APIs (fetch, Request, Response) used throughout. No heavy frameworks. |
| II. Simple Chat Interface | PASS | Single-page HTML interface, vanilla JS frontend, no mandatory build step for UI. Three-mode selector below chat window. |
| III. Cloudflare Workers First | PASS | All server logic on Workers via Hono. D1 for storage. Deployable via `wrangler deploy`. No Node.js APIs. |

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-llm-chat-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── index.ts                 # Hono app entry, route mounting
├── routes/
│   ├── chat.ts              # POST /api/chat — handles all 3 modes
│   ├── config.ts            # GET/POST /api/config — setup CRUD
│   ├── sessions.ts          # GET/POST /api/sessions — session management
│   └── cyclr.ts             # POST /api/cyclr/test, proxy routes
├── services/
│   ├── llm.ts               # LLM provider abstraction (OpenAI/Anthropic)
│   ├── mcp-client.ts        # MCP client for Mode I/II
│   ├── cyclr.ts             # Cyclr Data on Demand client (auth + method calls)
│   └── usage-logger.ts      # Token usage tracking to D1
├── db/
│   ├── schema.sql           # D1 schema definitions
│   └── migrations/          # D1 migration files
├── types.ts                 # Shared TypeScript types and Bindings
└── frontend/
    ├── index.html           # Single-page chat interface
    ├── setup.html           # Setup/configuration page
    ├── style.css            # Minimal CSS
    └── app.js               # Frontend JavaScript (vanilla)

wrangler.toml                # Workers + D1 configuration
package.json
tsconfig.json
```

**Structure Decision**: Single project with Hono serving both API routes (`/api/*`) and static frontend files. This aligns with the Lightweight principle — no separate frontend build, no monorepo overhead. Static HTML/CSS/JS files served via Hono's `serveStatic` or inline HTML responses.

## Complexity Tracking

> No constitution violations detected. No complexity justification needed.
