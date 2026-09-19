---
type: plan
branch: learn-from-doc-site
task: grounded-knowledge-chat--global-card-chat
complexity: complex
state: draft
updated: 2026-09-19
---

# Global chat grounded strictly in the learner's own cards

## What and why

`grounded-knowledge-chat`'s next coding task: a chat the learner can open from anywhere, ask a
free-text question, and get an answer built only from their own matched cards (via
`findTopMatchingCards`, already shipped) — never the model's own general knowledge. The "allow
general knowledge, off by default" toggle and "show which cards grounded the answer" are separate,
already-listed follow-on todo items — this plan only needs to make the default (cards-only) path
work end to end, with the response shape carrying enough (matched card ids) for those follow-ons to
build on without a second backend change.

This reuses the existing `qa-chat` agent's shape (Mastra agent, `generate-with-retry.ts`,
route-wiring convention) rather than inventing a new one — but it is a distinct agent and endpoint,
not an extension of `qa-chat`: `qa-chat` is topic/curriculum-scoped with an opt-in web-search tool;
this chat is global (no topic in view required) and must never reach for outside knowledge by
default. A stale, unbuilt 2026-09-12 plan (`.planning/2026-09-12-ai-chat-panel/plan.md`) proposed a
draggable docked panel with sub-topic-suggestion tools — out of scope here; this plan is the
narrower "answer from my cards" feature the current direction's own Scope actually asks for.

## Phases

### Phase 1: card-grounded chat endpoint
Goal: a new endpoint takes a free-text message, calls `findTopMatchingCards` for it, and returns a
reply generated only from the matched cards' prompt/answer text — the agent's system instructions
hard-forbid using knowledge not present in the supplied cards, and instruct it to say plainly when
the learner's cards don't cover the question rather than guessing. No tools (unlike `qa-chat` — no
web search, no sub-topic suggestion; this is answer-only). Model tier resolves through the existing
`resolveEffectiveModelTier` cascade with no topic/curriculum context (global default tier). All LLM
calls go through `generate-with-retry.ts`.
Key files: `apps/api/src/mastra/global-card-chat.agent.ts` (new, registered in `mastra.ts`'s
`AGENT_KEYS`), `apps/api/src/global-card-chat/global-card-chat.service.ts` + `.controller.ts` (new,
modeled on `apps/api/src/qa-chat/qa-chat.service.ts`/`.controller.ts`'s shape), `packages/shared/src/
global-card-chat.ts` (new — `AskGlobalCardChatInput { message, transcript? }`, `AskGlobalCardChatResult
{ reply, matchedCardIds }`), `apps/api/src/server.ts` + `router-table.ts` + `router.ts` (route
wiring: `POST /global-card-chat`).

### Phase 2: minimal global chat UI
Goal: a simple, always-available chat surface (input + message list, no drag/dock chrome — that's
out of scope, see "What and why") mounted in `apps/web/src/routes/__root.tsx` so it's reachable from
any page. Reuses `study-chat-sidebar.tsx`'s message-list/input/`useMutation` pattern against the new
endpoint. Transcript is client-side only, resent each turn — no new persistence, matching every
sibling chat feature in this app.
Key files: `apps/web/src/global-card-chat/global-card-chat-panel.tsx` (new),
`apps/web/src/global-card-chat/global-card-chat.api.ts` (new, TanStack `createServerFn`), wired into
`apps/web/src/routes/__root.tsx`.

### Phase 3: tests
Goal: service-level tests proving the agent is only ever given the matched cards' content (mock
`findTopMatchingCards`, assert the prompt passed to `generateWithRetry` contains only that content,
never an unrelated fact), a "no matching cards" case (replies that nothing in the learner's cards
covers this, does not fabricate), and an RTL test for the panel (render, ask, see reply).
Key files: `apps/api/src/global-card-chat/global-card-chat.service.test.ts` (new),
`apps/web/src/global-card-chat/global-card-chat-panel.test.tsx` (new).

## Constraints and risks

- **The one real risk this plan exists to prevent**: an implementer copying `qa-chat.agent.ts`
  wholesale and leaving its web-search tool in place, which would silently let the chat answer from
  outside knowledge by default — contradicts this direction's own Scope ("general knowledge only if
  allowed", not yet built). No tools at all in Phase 1, on purpose.
- Register the new agent in `mastra.ts`'s `AGENT_KEYS` — every other agent in this app is, skipping
  it means a silent observability gap, not a functional break.
- `AskGlobalCardChatResult.matchedCardIds` exists specifically so the two follow-on todo items
  (general-knowledge toggle, show-grounding-cards) don't need a second backend change to get the
  data they need.
- No new DB persistence — panel state is in-memory only, matching `study-chat-sidebar.tsx`.
