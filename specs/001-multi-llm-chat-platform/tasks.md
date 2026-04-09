# Tasks: Multi-LLM Chat Platform

**Input**: Design documents from `/specs/001-multi-llm-chat-platform/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single project: `src/` at repository root
- Frontend: `src/frontend/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and base configuration

- [x] T001 Initialize npm project with TypeScript, Hono, and Wrangler in package.json and tsconfig.json
- [x] T002 Create wrangler.toml with D1 database binding, compatibility date, and entry point src/index.ts
- [x] T003 [P] Create D1 schema file with all tables (config, chat_sessions, messages, usage_logs) in src/db/schema.sql
- [x] T004 [P] Create shared TypeScript types and Cloudflare Bindings interface in src/types.ts
- [x] T005 [P] Create Hono app entry point with route mounting and static file serving in src/index.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement LLM provider abstraction (OpenAI + Anthropic) with streaming support in src/services/llm.ts
- [x] T007 [P] Implement usage logger service for token tracking to D1 in src/services/usage-logger.ts
- [x] T008 [P] Implement configuration CRUD helpers (get/set/mask secrets) for D1 config table in src/services/config.ts
- [x] T009 Create QuickBooks method registry from reference/All_Method_of_Quickbook.txt as a static JSON map (category → methods with IDs) in src/data/quickbooks-methods.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 2 — Setup and Model Configuration (Priority: P1)

**Goal**: Users can configure LLM providers, MCP servers, system prompts, and Cyclr credentials through a Setup page

**Independent Test**: Navigate to Setup, enter credentials for each part, test connections, verify persistence

### Implementation for User Story 2

- [x] T010 [US2] Implement config API routes (GET /api/config, POST /api/config) in src/routes/config.ts
- [x] T011 [US2] Implement LLM test connection endpoint (POST /api/config/test-llm) in src/routes/config.ts
- [x] T012 [US2] Implement Cyclr test connection endpoint (POST /api/config/test-cyclr) with bearer token generation in src/routes/config.ts
- [x] T013 [US2] Create Setup page HTML with 4-part form (Model, MCP, System Prompt, Direct API) in src/frontend/setup.html
- [x] T014 [US2] Create Setup page JavaScript for form handling, test connections, save config in src/frontend/setup.js
- [x] T015 [US2] Create shared CSS styles for Setup and Chat pages in src/frontend/style.css

**Checkpoint**: Setup page is fully functional — users can configure all settings and test connections

---

## Phase 4: User Story 1 — Basic Chat with MCP Model (Priority: P1)

**Goal**: Users can chat with an LLM that uses MCP server tools to answer queries (Mode I)

**Independent Test**: Configure MCP server URL, select Mode I, send a message, verify LLM uses MCP tools

### Implementation for User Story 1

- [x] T016 [US1] Implement MCP client service (connect via SSE, list tools, call tools) in src/services/mcp-client.ts
- [x] T017 [US1] Implement session API routes (POST /api/sessions, GET /api/sessions/:id, DELETE /api/sessions/:id) in src/routes/sessions.ts
- [x] T018 [US1] Implement chat API route (POST /api/chat) with SSE streaming, Mode I MCP tool-use loop in src/routes/chat.ts
- [x] T019 [US1] Create chat interface HTML with message list, input form, mode selector, New Chat and Clear buttons in src/frontend/index.html
- [x] T020 [US1] Create chat interface JavaScript — send messages, receive SSE stream, render responses, handle mode switching in src/frontend/app.js
- [x] T021 [US1] Wire Setup button in chat page to navigate to setup.html, wire back button in setup to return to chat in src/frontend/index.html and src/frontend/setup.html

**Checkpoint**: Mode I chat is fully functional — MCP-powered chat works end to end

---

## Phase 5: User Story 3 — Guided Mode with System Prompt (Priority: P2)

**Goal**: Mode II combines system prompt guidance with MCP tools for controlled responses

**Independent Test**: Configure system prompt in Setup, select Mode II, send a message, verify response follows guidelines + uses MCP tools

### Implementation for User Story 3

- [x] T022 [US3] Extend chat route to handle Mode II — inject system prompt from config into LLM call alongside MCP tools in src/routes/chat.ts
- [x] T023 [US3] Update frontend mode selector to enable Mode II and display active system prompt indicator in src/frontend/app.js

**Checkpoint**: Mode II chat works — system prompt + MCP tools combined

---

## Phase 6: User Story 6 — All QuickBooks Methods via Cyclr (Priority: P2)

**Goal**: Backend supports calling all 260 QuickBooks methods through Cyclr Data on Demand API

**Independent Test**: Call representative methods (List Customers, List Invoices, Get Balance Sheet Report) through Cyclr API and verify correct responses

### Implementation for User Story 6

- [x] T024 [US6] Implement Cyclr service — OAuth2 token generation, token caching/refresh, method call proxy in src/services/cyclr.ts
- [x] T025 [US6] Implement Cyclr proxy routes (POST /api/cyclr/method/:methodId, GET /api/cyclr/methods) in src/routes/cyclr.ts
- [x] T026 [US6] Build LLM tool definitions from QuickBooks method registry — convert method catalog to tool schemas for LLM function calling in src/services/cyclr-tools.ts

**Checkpoint**: All 260 QuickBooks methods are callable through the Cyclr proxy API

---

## Phase 7: User Story 4 — Direct API Call Mode (Priority: P2)

**Goal**: Mode III lets the LLM bypass MCP and directly call Cyclr connector APIs

**Independent Test**: Configure Cyclr credentials, select Mode III, ask "List all customers", verify response comes from direct API call

### Implementation for User Story 4

- [x] T027 [US4] Extend chat route to handle Mode III — LLM selects Cyclr tools, calls methods directly, returns results in src/routes/chat.ts
- [x] T028 [US4] Add Mode III system prompt/instructions from Setup Part 4 config into LLM context in src/routes/chat.ts
- [x] T029 [US4] Update frontend to show connector selection status and Mode III indicator in src/frontend/app.js

**Checkpoint**: Mode III chat works — LLM directly calls Cyclr APIs without MCP

---

## Phase 8: User Story 5 — Session Management and Usage Logging (Priority: P3)

**Goal**: All inputs/outputs/token costs are logged; users can start new sessions or clear history

**Independent Test**: Conduct chat session, verify logs capture tokens/costs, start new session to confirm no carryover, clear session to confirm history removed

### Implementation for User Story 5

- [x] T030 [US5] Integrate usage logger into chat route — log input/output tokens and estimated cost after each LLM response in src/routes/chat.ts
- [x] T031 [US5] Add usage summary endpoint (GET /api/sessions/:id with usage aggregation) in src/routes/sessions.ts
- [x] T032 [US5] Update frontend to display token usage and cost per message, show session usage summary in src/frontend/app.js
- [x] T033 [US5] Implement New Chat button handler — create new session, clear UI, reset LLM context in src/frontend/app.js
- [x] T034 [US5] Implement Clear/Reset button handler — DELETE session, clear UI in src/frontend/app.js

**Checkpoint**: Full session lifecycle works — logging, new session, clear session all functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, and final quality

- [x] T035 [P] Add error handling for LLM API failures — preserve user input, display user-friendly error in src/routes/chat.ts
- [x] T036 [P] Add error handling for MCP server unreachable — notify user in chat in src/services/mcp-client.ts
- [x] T037 [P] Add Cyclr bearer token auto-refresh on 401 in src/services/cyclr.ts
- [x] T038 [P] Add configuration validation — show clear errors when required config is missing for selected mode in src/routes/chat.ts
- [x] T039 [P] Ensure logging failures do not block chat responses in src/services/usage-logger.ts
- [x] T040 Verify wrangler dev runs locally and wrangler deploy succeeds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US2 Setup Page (Phase 3)**: Depends on Foundational — config service needed
- **US1 MCP Chat (Phase 4)**: Depends on Foundational + US2 (needs config to be saveable)
- **US3 Guided Mode (Phase 5)**: Depends on US1 (extends chat route)
- **US6 QuickBooks Methods (Phase 6)**: Depends on Foundational (needs Cyclr service base)
- **US4 Direct API Mode (Phase 7)**: Depends on US6 (needs Cyclr tools) + US1 (extends chat route)
- **US5 Session Logging (Phase 8)**: Depends on US1 (needs working chat to log)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US2 (P1)**: Can start after Foundational — No dependencies on other stories
- **US1 (P1)**: Can start after Foundational + US2 — Needs config to be saveable
- **US3 (P2)**: Depends on US1 — Extends Mode I with system prompt
- **US6 (P2)**: Can start after Foundational — Independent of chat stories
- **US4 (P2)**: Depends on US1 + US6 — Needs chat route + Cyclr tools
- **US5 (P3)**: Depends on US1 — Needs working chat to log usage

### Parallel Opportunities

- T003, T004, T005 can run in parallel (Phase 1)
- T007, T008 can run in parallel (Phase 2)
- US6 (Phase 6) can run in parallel with US3 (Phase 5) after US1 completes
- All Polish tasks (T035-T039) can run in parallel

---

## Implementation Strategy

### MVP First (US2 + US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US2 — Setup Page
4. Complete Phase 4: US1 — MCP Chat
5. **STOP and VALIDATE**: Test Mode I chat end to end
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US2 → Setup page works → Config is saveable
3. Add US1 → Mode I chat works → Deploy MVP
4. Add US3 → Mode II works (guided prompts)
5. Add US6 → QuickBooks methods callable
6. Add US4 → Mode III works (direct API)
7. Add US5 → Usage logging complete
8. Polish → Error handling, edge cases

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable at its checkpoint
- Development uses mock LLM responses to avoid token costs
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
