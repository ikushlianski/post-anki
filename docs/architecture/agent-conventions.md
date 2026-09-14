# Agent and tool-call conventions

This is the standing contract every Mastra agent and LLM call site in this app already follows,
written down so a new agent/call site matches it by default instead of reinventing a weaker
version. It describes what's actually built, not an aspiration.

## Registering an agent

Every agent lives in `apps/api/src/mastra/<name>.agent.ts` as a `createXxxAgent(env)` factory, and
every factory is imported and registered under a stable string key in `AGENT_KEYS`
(`apps/api/src/mastra/mastra.ts`). A raw, unregistered call to a model provider is never made
directly from a service/orchestrator — every LLM call goes through a registered agent's
`.generate()`/`.stream()`, so it's covered by tiering, retry, and cost logging below without any
per-call-site opt-in.

## Model tiering — cascaded, not per-agent

Every agent's `model:` field is the same function, `dynamicResolvedModel(env)`
(`apps/api/src/mastra/model.ts`) — no agent hardcodes its own model. At call time it reads
`subjectId`/`curriculumId` off the live `RequestContext` and resolves an effective tier
(`resolveEffectiveModelTier`, `apps/api/src/mastra/tier-resolver.ts`): a curriculum's own tier
override wins, then its subject's, then the global default (`admin_settings`). A call site with no
subject/curriculum in scope (e.g. `decide`) falls straight to the global default. This
is a business/cost lever — an admin can push weaker or stronger models at a subject or a single
course without a deploy — not just a technical default.

## Retry and cost logging — one shared wrapper, not per-call-site handling

Every real `agent.generate()` call goes through one of two wrappers in
`apps/api/src/mastra/generate-with-retry.ts`:
- `generateWithRetry(op, curriculumId, agentKey, fn)` — 2 retries (3 attempts total) via `p-retry`,
  for a call site with no retry logic of its own.
- `recordGenerateCall(op, curriculumId, agentKey, fn)` — recording only, for a call site whose own
  retry/error handling must not change.

Both record one row per whole attempt sequence (not per individual retry) to `llm_call_events`:
duration, success, token usage, and the failing error message on a FAIL — this is what the admin
observability page's cost/usage view reads. Recording failures are swallowed
(`safeRecordLlmCallEvent`) so a bug in the observability path can never surface as a caller-visible
failure — the actual LLM result is what the caller must get back regardless.

## Memory — explicit, Postgres-backed context, not a framework memory layer

No agent uses `@mastra/memory` or any other framework-managed conversation memory. Every agent
call is stateless per invocation; conversation state lives in this app's own Postgres tables
(chat/transcript rows, curriculum structure turns) and is assembled into the prompt explicitly by
the calling service on every request. This is a deliberate choice, not a gap — the app already
needs that history durable, queryable, and owned by its own schema (for review, for re-generation,
for the post-anki browser itself to show), which a framework-owned memory store wouldn't give it
for free.

The one genuine duplication this pattern has produced: turning a stored transcript into a
role-labeled prompt block. Use the shared `formatTranscript` helper in `@post-anki/core`
(`packages/core/src/mastra/format-transcript.ts`) — not a fourth hand-rolled inline version — for
any new chat-style agent call.

## Adding a new agent

1. Write `apps/api/src/mastra/<name>.agent.ts`, model field set to `dynamicResolvedModel(env)`.
2. Register it under a new `AGENT_KEYS` entry in `apps/api/src/mastra/mastra.ts`.
3. Call it through `generateWithRetry`/`recordGenerateCall`, never a bare `agent.generate()`.
4. If it's a chat-style agent needing prior turns in its prompt, use `formatTranscript` from
   `@post-anki/core` rather than a new inline formatter.
