# Feature Specification: Multi-LLM Chat Platform

**Feature Branch**: `001-multi-llm-chat-platform`
**Created**: 2026-04-02
**Status**: Draft
**Input**: User description: "Multi-LLM Chat Platform with MCP, Guided Prompts, and Direct API Integration"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Basic Chat with MCP Model (Priority: P1)

A user opens the chat interface and selects Mode I (MCP Model). They type a question such as "List all my QuickBooks customers." The system routes the query to the configured LLM, which uses the connected MCP server as a tool to retrieve data and returns the answer in the chat window.

**Why this priority**: This is the core value proposition — enabling users to chat with an LLM that can call external tools via MCP to answer real business queries. Without this, the platform has no differentiating function.

**Independent Test**: Can be fully tested by configuring an MCP server URL, selecting Mode I, sending a message, and verifying the LLM uses MCP tools to generate a response.

**Acceptance Scenarios**:

1. **Given** a configured MCP server and selected LLM, **When** the user types a question and presses send, **Then** the LLM invokes MCP tools and returns a relevant answer in the chat.
2. **Given** Mode I is selected but no MCP server is configured, **When** the user sends a message, **Then** the system displays a clear error prompting the user to configure an MCP server in Setup.
3. **Given** an active chat session, **When** the user clicks "New Chat", **Then** a fresh session starts with no memory of the previous conversation.

---

### User Story 2 - Setup and Model Configuration (Priority: P1)

A user clicks the Setup button on the right-hand side of the interface. They select an LLM provider (OpenAI or Anthropic), enter their API key, and test the connection. They also configure the MCP server URL, enter a system prompt for guided mode, and provide Cyclr Direct API credentials (X-Cyclr Account, Client ID, Client Secret). They test the Cyclr connection to verify bearer token generation.

**Why this priority**: Without configuration, none of the three modes can function. This is a prerequisite for all chat interactions.

**Independent Test**: Can be tested by navigating to Setup, entering credentials for each section, running "Test Connection" for both LLM and Cyclr API, and verifying success/failure feedback.

**Acceptance Scenarios**:

1. **Given** the user is on the Setup page, **When** they select "Anthropic" as provider and enter a valid API key and click "Test Connection", **Then** the system confirms the connection is successful.
2. **Given** the user enters an invalid API key, **When** they click "Test Connection", **Then** the system displays a clear error message indicating the key is invalid.
3. **Given** the user enters Cyclr credentials (X-Cyclr Account, Client ID, Client Secret), **When** they click "Test Connection" for Direct API, **Then** the system generates a bearer token and confirms connectivity.
4. **Given** the user enters an MCP server URL, **When** they save the configuration, **Then** the URL is stored and available for Mode I and Mode II.

---

### User Story 3 - Guided Mode with System Prompt (Priority: P2)

A user selects Mode II (MCP with Guideline Model). They have previously defined a system prompt in Setup (Part 3). When they send a chat message, the LLM uses both the system prompt instructions and the MCP server tools to generate responses that follow the defined guidelines.

**Why this priority**: This extends Mode I by adding structured guidance, enabling more controlled and domain-specific responses. It depends on Mode I infrastructure being in place.

**Independent Test**: Can be tested by configuring a system prompt in Setup, selecting Mode II, sending a question, and verifying the response follows the system prompt guidelines while also leveraging MCP tools.

**Acceptance Scenarios**:

1. **Given** a configured system prompt and MCP server, **When** the user sends a message in Mode II, **Then** the response reflects both the system prompt guidance and MCP tool results.
2. **Given** Mode II is selected but no system prompt is defined, **When** the user sends a message, **Then** the system either uses a sensible default prompt or notifies the user to configure one in Setup.

---

### User Story 4 - Direct API Call Mode (Priority: P2)

A user selects Mode III (Direct API Call Model). They have configured Cyclr credentials and selected a connector (e.g., QuickBooks) in Setup. When they send a message, the LLM bypasses MCP tools entirely and directly calls the configured connector APIs through Cyclr's Data on Demand endpoints. A separate system prompt/instructions field in Setup Part 4 guides the LLM's behavior for this mode.

**Why this priority**: This provides an alternative integration path that does not depend on MCP, broadening the platform's utility. It requires the Cyclr backend work to be complete.

**Independent Test**: Can be tested by configuring Cyclr credentials, selecting QuickBooks connector, choosing Mode III, sending a customer-related query, and verifying the response comes from a direct API call (not MCP).

**Acceptance Scenarios**:

1. **Given** valid Cyclr credentials and QuickBooks connector selected, **When** the user asks "List all customers" in Mode III, **Then** the LLM calls the Cyclr API directly and returns customer data.
2. **Given** Mode III is selected but Cyclr credentials are missing or invalid, **When** the user sends a message, **Then** the system displays an error prompting configuration in Setup.
3. **Given** Mode III is active, **When** the LLM determines which API method to call, **Then** it uses the system prompt/instructions from Setup Part 4 to guide its behavior.

---

### User Story 5 - Session Management and Usage Logging (Priority: P3)

A user conducts a chat session. All inputs, outputs, and token usage costs for the selected model are logged and stored. The user can start a new session (clearing LLM memory) or reset/clear the current session (removing all conversation history from the display).

**Why this priority**: Logging and session management are important for transparency and cost tracking but do not block core chat functionality.

**Independent Test**: Can be tested by conducting a chat session, verifying logs capture inputs/outputs/token counts/costs, starting a new session and confirming no carryover, and clearing a session and confirming history is removed.

**Acceptance Scenarios**:

1. **Given** an active chat session, **When** messages are exchanged, **Then** each input, output, and associated token usage cost is logged and stored.
2. **Given** an active session, **When** the user clicks "New Chat", **Then** a new session begins with no conversation history or LLM memory from the previous session.
3. **Given** an active session with messages, **When** the user clicks "Clear/Reset", **Then** all conversation history is removed from the display and the session is reset.
4. **Given** logged session data, **When** the user reviews usage, **Then** they can see token counts and estimated costs per interaction.

---

### User Story 6 - All QuickBooks Methods via Cyclr (Priority: P2)

The backend supports calling all 260 QuickBooks methods across 42 categories through the Cyclr Data on Demand API (connector ID 88534). Categories include: Access Tokens, Accounts, Attachable, Bills, Categories, Charges, Class, Company Info, Credit Cards, Credit Memos, Custom Fields, Customers, Data Capture, Data Query, Departments, Deposits, EChecks, Employees, Estimates, General Webhooks, Internal, Invoices, Items, Journal Entries, Line Items, Payment Methods, Payments, Preferences, Purchase Orders, Purchases, Recurring Transactions, Refund Receipts, Reports, Sales Receipt, Tax Codes, Tax Rates, Terms, Testing, Time Activities, Triggers, Vendors, and Webhooks. These methods are available for Mode III (Direct API) and are dynamically exposed as tools the LLM can invoke based on the user's query context.

**Why this priority**: Full QuickBooks coverage validates the entire Direct API integration path and provides comprehensive business data access from day one.

**Independent Test**: Can be tested by calling representative methods from each category through the Cyclr API (connector ID 88534) — e.g., List Customers, List Invoices, Get Balance Sheet Report, Create Payment — and verifying correct responses.

**Acceptance Scenarios**:

1. **Given** valid Cyclr credentials and the QuickBooks connector, **When** the system calls "List Customers" (ID 1571298) via the Cyclr Data on Demand endpoint, **Then** a list of customers is returned successfully.
2. **Given** valid credentials, **When** the system calls "Create Invoice" (ID 1571378) with required fields, **Then** a new invoice is created in QuickBooks and the response confirms creation.
3. **Given** valid credentials, **When** the system calls "Get Balance Sheet Report" (ID 1571238), **Then** the report data is returned successfully.
4. **Given** valid credentials, **When** the LLM receives a user query like "Show me overdue invoices", **Then** it selects the appropriate method (List Overdue Invoices, ID 1571332) and returns the results.

---

### Edge Cases

- What happens when the LLM provider's API is down or returns a rate limit error? The system MUST display a user-friendly error and not lose the user's input message.
- What happens when an MCP server is unreachable during a Mode I or Mode II query? The system MUST inform the user that the tool server is unavailable.
- What happens when the Cyclr bearer token expires mid-session? The system MUST automatically attempt to regenerate the token before failing the request.
- What happens when the user switches modes mid-conversation? The system MUST allow mode switching; the new mode applies to subsequent messages only.
- What happens if token usage logging fails? Logging failures MUST NOT block or interrupt the chat experience.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a single-page chat interface accessible without login or authentication.
- **FR-002**: System MUST support three interaction modes selectable below the chat window: MCP Model (Mode I), MCP with Guideline Model (Mode II), and Direct API Call Model (Mode III).
- **FR-003**: System MUST provide a Setup page accessible via a button on the right-hand side of the interface.
- **FR-004**: Setup MUST allow users to select an LLM provider (OpenAI or Anthropic) and enter an API key.
- **FR-005**: Setup MUST include a "Test Connection" feature for verifying LLM provider credentials.
- **FR-006**: Setup MUST allow users to input one or more MCP server URLs.
- **FR-007**: Setup MUST provide a text area for defining a system prompt used in Mode II (Guided Mode).
- **FR-008**: Setup MUST allow entry of Cyclr Direct API credentials: X-Cyclr Account, Client ID, and Client Secret.
- **FR-009**: Setup MUST include a "Test Connection" feature for Cyclr API that verifies credentials by generating a bearer token.
- **FR-010**: Setup MUST allow selection of a connector for Direct API mode (QuickBooks as the initial option).
- **FR-011**: Setup MUST provide a text area for system prompt/instructions specific to Mode III (Direct API).
- **FR-012**: In Mode I, the LLM MUST use the configured MCP server(s) as tools to answer queries.
- **FR-013**: In Mode II, the LLM MUST use both the system prompt and MCP server(s) to generate responses.
- **FR-014**: In Mode III, the LLM MUST bypass MCP and directly call configured connector APIs via Cyclr Data on Demand.
- **FR-015**: System MUST support starting a new chat session with no memory carryover from previous sessions.
- **FR-016**: System MUST support clearing/resetting the current session, removing all conversation history.
- **FR-017**: System MUST log all inputs, outputs, and token usage costs for each chat session.
- **FR-018**: Backend MUST support all 260 QuickBooks methods across 42 categories via the Cyclr Data on Demand API (connector ID 88534), including but not limited to: Accounts, Attachable, Bills, Customers, Invoices, Items, Payments, Purchases, Vendors, Reports, and Webhooks.
- **FR-019**: System MUST allow users to switch between modes during a conversation; the selected mode applies to subsequent messages.
- **FR-020**: System MUST display clear error messages when configuration is missing or connections fail.

### Key Entities

- **Chat Session**: Represents a conversation between the user and an LLM. Contains a sequence of messages, the selected mode, model provider, and accumulated token usage.
- **Message**: An individual input or output within a session. Includes content, role (user/assistant), timestamp, token count, and estimated cost.
- **Configuration**: User-defined settings including LLM provider, API key, MCP server URLs, system prompts, and Cyclr credentials. Persisted across sessions.
- **Connector Method**: A specific API operation available through a Cyclr connector (e.g., "List Customers" on the QuickBooks connector). Identified by connector ID and method ID.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can send a message and receive an LLM-generated response in under 10 seconds for typical queries across all three modes.
- **SC-002**: Users can complete full Setup configuration (all four parts) in under 5 minutes.
- **SC-003**: "Test Connection" features return success/failure feedback within 5 seconds for both LLM and Cyclr API.
- **SC-004**: All 260 QuickBooks methods across 42 categories are callable and return correct results through the platform.
- **SC-005**: Token usage and cost data is accurately logged for 100% of chat interactions.
- **SC-006**: Users can start a new session or clear the current session and confirm the action takes effect immediately (no stale data).
- **SC-007**: The system is accessible and fully functional with zero setup beyond opening the URL (no login, no installation).

## Assumptions

- Users will provide their own API keys for OpenAI or Anthropic; the platform does not supply or manage shared keys.
- The MCP server(s) used in Mode I and Mode II are externally hosted and managed; the platform only needs to connect to them, not host them.
- QuickBooks connector (ID 88534) is pre-configured in the Cyclr account; the platform calls existing methods rather than creating new connectors.
- The Cyclr account (cf77acb0-5528-4790-ab2b-7f2618dea5eb) and credentials are pre-provisioned and valid.
- Configuration data (API keys, credentials, prompts) is stored locally in the browser or in Cloudflare KV; no user accounts or server-side user management is needed.
- During development, mock/stub responses are used instead of live LLM API calls to avoid unnecessary token costs, per the development guidelines.
- The platform targets modern browsers (Chrome, Firefox, Safari, Edge — latest two versions).
- A single concurrent user is the baseline; multi-user scaling is not a requirement for the initial version.
