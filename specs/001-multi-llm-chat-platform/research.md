# Research: Multi-LLM Chat Platform

**Branch**: `001-multi-llm-chat-platform`
**Date**: 2026-04-02

## R1: Hono on Cloudflare Workers

**Decision**: Use Hono as the web framework on Cloudflare Workers.

**Rationale**: Hono is ultralight (~14KB), designed for edge runtimes, and has first-class Cloudflare Workers support. It provides Express-like routing, built-in SSE streaming via `hono/streaming`, and type-safe access to Workers bindings (D1, KV) through `c.env`. No adapter layer needed.

**Alternatives considered**:
- itty-router: Even lighter but lacks middleware ecosystem, SSE helpers, and typed bindings.
- Raw Workers fetch handler: No routing abstractions; becomes unwieldy with 10+ routes.

**Key patterns**:
- Typed bindings: `Hono<{ Bindings: { DB: D1Database } }>` for D1 access via `c.env.DB`
- SSE streaming: `streamSSE(c, async (stream) => { ... })` from `hono/streaming`
- Static files: `serveStatic({ root: './' })` middleware or inline HTML via `c.html()`

## R2: Cloudflare D1 for Storage

**Decision**: Use Cloudflare D1 as the sole persistence layer.

**Rationale**: D1 is Cloudflare-native SQLite, zero-config with Workers, no external database to provision. Fits the "Lightweight" and "Cloudflare Workers First" constitution principles. Good for structured data (sessions, logs, config).

**Alternatives considered**:
- Cloudflare KV: Key-value only; poor for relational queries (session logs with joins).
- Durable Objects: Overkill for this scale; designed for real-time coordination.
- Browser localStorage only: No server-side logging capability; data lost on device change.

**Key patterns**:
- Schema managed via `.sql` files applied with `wrangler d1 execute`
- Queries via `c.env.DB.prepare(sql).bind(...params).all()`
- Local dev via `wrangler dev --local` (uses local SQLite)

## R3: LLM Provider Integration

**Decision**: Implement a thin abstraction over OpenAI and Anthropic APIs supporting both chat completion and tool use.

**Rationale**: Both providers expose HTTP APIs callable via `fetch` from Workers. The Anthropic SDK and OpenAI SDK both have lightweight browser/edge-compatible builds. A common interface allows mode switching without duplicating chat logic.

**Alternatives considered**:
- LangChain/LlamaIndex: Too heavy, violates Lightweight principle, adds unnecessary abstraction.
- Direct fetch only (no SDK): Viable but loses typed responses and tool-use parsing helpers.

**Key patterns**:
- Provider interface: `sendMessage(messages, tools?, systemPrompt?) → AsyncGenerator<chunk>`
- Tool use: Both providers return tool_call objects; parse and route to MCP or Cyclr
- Streaming: Use SSE to stream LLM token output to the frontend

## R4: MCP Client on Workers

**Decision**: Use `@modelcontextprotocol/sdk` as the MCP client library, connecting to remote MCP servers via SSE/HTTP transport.

**Rationale**: The MCP SDK provides a typed client that handles tool listing, tool calling, and result parsing. Remote MCP servers (including Shadcn MCP if exposed via HTTP) communicate over SSE transport. Note: Shadcn MCP natively uses stdio transport (local process) — for Workers, the MCP server must be hosted externally with an HTTP/SSE endpoint.

**Alternatives considered**:
- Custom MCP client: More work, less reliable, no benefit.
- Skip MCP, use direct tool definitions: Loses the MCP ecosystem compatibility.

**Key patterns**:
- Connect: `new Client()` with SSE transport pointing to user-configured MCP server URL
- List tools: `client.listTools()` → convert to LLM tool schemas
- Call tools: When LLM returns tool_call, `client.callTool(name, args)` → return result to LLM

## R5: Cyclr Data on Demand Integration

**Decision**: Implement a Cyclr client that authenticates via OAuth2 client credentials and calls connector methods through the Data on Demand API.

**Rationale**: Cyclr's API is straightforward REST. Authentication generates a bearer token via `POST /token` with client_id/client_secret. Method calls use `GET /v1.0/account/connectors/{connectorId}/methods/{methodId}`. The QuickBooks connector (ID 88534) has 9 Customer methods with known IDs.

**Alternatives considered**:
- Direct QuickBooks API: Requires separate OAuth2 with Intuit, more complex auth flow.
- MCP wrapper for Cyclr: Adds indirection; Mode III explicitly bypasses MCP per spec.

**Key patterns**:
- Auth: `POST https://api.cyclr.uk/token` with `grant_type=client_credentials`
- Headers: `X-Cyclr-Account: {accountId}`, `Authorization: Bearer {token}`
- Method call: `GET https://api.cyclr.uk/v1.0/account/connectors/88534/methods/{methodId}`
- Token refresh: Cache token, regenerate on 401

**QuickBooks connector (ID 88534)**: 260 methods across 42 categories. Full method catalog with IDs is documented in `contracts/api.md`. The method registry is loaded from `reference/All_Method_of_Quickbook.txt` at build time to generate LLM tool definitions dynamically. Key categories include Customers (9 methods), Invoices (13 methods), Payments (10 methods), Bills (8 methods), Vendors (7 methods), Reports (9 methods), and more.

## R6: Frontend Approach

**Decision**: Vanilla HTML/CSS/JS served as static files from Workers. No build step.

**Rationale**: Constitution mandates simplicity and no mandatory build toolchain. A single `index.html` with embedded or linked JS/CSS is sufficient for a chat interface with a setup panel. Use native `fetch()` and `EventSource` for API calls and SSE streaming.

**Alternatives considered**:
- React/Vue/Svelte: Violates Lightweight principle; requires build step; overkill for 2 pages.
- HTMX: Interesting but adds a dependency for minimal gain on this scale.

**Key patterns**:
- Chat UI: Message list div + input form, JS appends messages
- SSE: `new EventSource('/api/chat/stream?sessionId=...')` or fetch with ReadableStream
- Setup: Separate page or slide-out panel, form submissions via fetch POST
- Mode selector: Radio buttons or segmented control below chat input

## R7: Testing Strategy

**Decision**: Use Vitest with miniflare for Workers integration tests. Mock LLM API responses during development.

**Rationale**: Per development guidelines, avoid live LLM API calls during testing. Vitest + miniflare provides a local Workers runtime with D1 support. Mock LLM responses to test routing, mode switching, and session management without token costs.

**Alternatives considered**:
- Jest: Less native Workers support; miniflare integrates better with Vitest.
- No tests: Violates good practice; the three-mode architecture needs test coverage.

**Key patterns**:
- Mock LLM: Return predefined responses for specific prompts
- Mock Cyclr: Return sample QuickBooks customer data
- D1 tests: Use local D1 instance via miniflare
