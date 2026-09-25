# Plan: opt into general knowledge or a web search from single-item chat

## Goal
By default, single-item chat (`POST /knowledge-bits/:id/chat`) stays grounded on the item's own
`body` only (already built). Let the learner ask, per message, for the model to also draw on its
own general knowledge and/or run a web search — for that one exchange only, never a standing mode.

## Design

- Extend `askKnowledgeBitChatInput` (`packages/shared/src/knowledge-bit-chat.ts`) with two
  independent optional booleans: `allowGeneralKnowledge?: boolean`, `allowWebSearch?: boolean`
  (both default false when omitted — existing callers with neither flag get today's behavior
  unchanged).
- `knowledge-bit-chat.agent.ts` switches from a static `Agent` to `qa-chat.agent.ts`'s dynamic
  pattern: `instructions` and `tools` become functions of `requestContext`, reading
  `allowGeneralKnowledge`/`allowWebSearch` set per-call.
  - Instructions are built by one function taking both flags (not four separate full-text
    constants like `global-card-chat` — two independent booleans make 4 combos, and the shared
    "never invent a url" / "reply in plain text" tail stays identical across all of them, so a
    single builder appending/removing clauses is less duplication-prone than four near-identical
    blocks).
  - `allowGeneralKnowledge: true` → instructions permit falling back to general knowledge, but
    only after the item's own content has been checked first, and only for this exchange.
  - `allowWebSearch: true` → attach a `searchWeb` tool (same `webSearch()` backend as qa-chat,
    `apps/api/src/probe/probe-grounding.ts`), reusing the exact "never invent a url, must be
    copied verbatim from a searchWeb result" hard rule text from `qa-chat.agent.ts:32-34`.
  - Neither flag → today's instructions, unchanged, no tools — this is the regression guard.
- `knowledge-bit-chat.service.ts` builds a `RequestContext` carrying both flags (mirrors
  `qa-chat.service.ts`'s `qaChatDeps`/`curriculumId` context entries), passes `maxSteps` only when
  `allowWebSearch` is set (no tool steps needed otherwise).
- New minimal tools factory in `mastra/knowledge-bit-chat-tools.ts` (mirrors
  `qa-chat-tools.ts`'s shape but only `searchWeb` — no `suggestSubtopics`, nothing here needs it).

## Non-goals (this unit)
- Persisting the opt-in choice — per-message only, exactly like the user's own phrasing ("for a
  given exchange").
- Creating/editing a knowledge item from the chat — third, dependent todo item in this direction.
- Citations surfaced back to the caller are optional polish; `{ reply }` stays the only required
  response field (qa-chat returns `citations` too, but nothing in this unit's scope asked for it,
  and adding it isn't needed to satisfy the ask — skip unless review flags a real gap).

## Reuse
- `qa-chat.agent.ts`'s dynamic `tools`/`RequestContext` pattern.
- `webSearch()` (`apps/api/src/probe/probe-grounding.ts`) — the actual HTTP call.
- `isSafeSourceUrl` citation filtering (`qa-chat-tools.ts:75`) if a tool wrapper is added.
- The "never invent a url" hard-rule text (`qa-chat.agent.ts:32-34`).
