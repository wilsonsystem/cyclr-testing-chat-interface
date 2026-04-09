<!--
  Sync Impact Report
  Version change: 0.0.0 → 1.0.0
  Modified principles: N/A (initial creation)
  Added sections: Core Principles (3), Technology Constraints, Development Workflow, Governance
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ (no updates needed, generic structure)
    - .specify/templates/spec-template.md ✅ (no updates needed, generic structure)
    - .specify/templates/tasks-template.md ✅ (no updates needed, generic structure)
  Follow-up TODOs: None
-->

# Cyclr Testing Chat Interface Constitution

## Core Principles

### I. Lightweight by Default

Every dependency, abstraction, and file MUST justify its existence. The project MUST minimize bundle size, runtime overhead, and cognitive complexity. No frameworks beyond what Cloudflare Workers natively supports. Prefer native Web APIs (fetch, Request, Response, WebSocket) over third-party wrappers. If a feature can be accomplished in fewer lines without a library, it MUST be done without a library.

### II. Simple Chat Interface

The chat interface MUST be intuitive and require zero configuration from the end user. The UI MUST be a single-page HTML interface with minimal JavaScript — no build step required for the frontend unless complexity demands it. All chat interactions MUST follow a straightforward request/response or streaming pattern. The interface MUST work in modern browsers without polyfills. Avoid over-engineering: a working chat box that sends and receives messages is the baseline, not a full-featured messaging platform.

### III. Cloudflare Workers First

All server-side logic MUST run on Cloudflare Workers. The architecture MUST respect Workers constraints: no Node.js-specific APIs, no filesystem access, execution within CPU time limits. Use Cloudflare-native services (KV, Durable Objects, R2, D1) when persistence or state is needed. The application MUST be deployable via `wrangler deploy` with no additional infrastructure. Cold start performance and edge execution are first-class concerns.

## Technology Constraints

- **Runtime**: Cloudflare Workers (V8 isolate, not Node.js)
- **Frontend**: Static HTML/CSS/JS served from Workers or Cloudflare Pages; no mandatory build toolchain
- **State**: Cloudflare KV, Durable Objects, or D1 as needed — no external databases
- **API Integration**: Cyclr connector APIs called from Workers via fetch
- **Language**: TypeScript for Workers code; vanilla JS acceptable for simple frontend scripts
- **Package Manager**: npm; dependencies MUST be kept to the absolute minimum
- **Deployment**: Wrangler CLI (`wrangler deploy`); no Docker, no VMs, no containers

## Development Workflow

- Keep the codebase small and navigable — a new developer MUST be able to understand the full project in under 30 minutes
- Each feature MUST be testable locally using `wrangler dev`
- Commits MUST be focused and atomic — one logical change per commit
- Code review is encouraged but not gated for solo development
- Prefer inline comments only where behavior is non-obvious; the code itself MUST be the primary documentation

## Governance

This constitution is the authoritative guide for all architectural and design decisions in the Cyclr Testing Chat Interface project. Any proposed change that conflicts with these principles MUST be justified with a clear rationale and documented as a constitution amendment before implementation. Amendments require updating this file with a version bump and recording the change rationale.

**Version**: 1.0.0 | **Ratified**: 2026-04-02 | **Last Amended**: 2026-04-02
