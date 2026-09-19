---
type: plan
branch: learn-from-doc-site
task: grounded-knowledge-chat--general-knowledge-toggle
complexity: complex
state: draft
updated: 2026-09-19
---

# Let the learner allow general AI knowledge in chat, off by default

## What and why

`grounded-knowledge-chat`'s next coding task, following directly from the just-shipped global
card chat. Today `askGlobalCardChat` always hard-forbids anything outside the learner's matched
cards. This adds an explicit, per-message opt-in (`allowGeneralKnowledge`, default `false`) that,
when set, lets the agent also use its own general knowledge — but must always say so plainly in
the reply when it does, so the learner can tell a cards-grounded answer from a general one at a
glance (this is what makes the next todo item, "show which cards grounded each answer," a
meaningful signal rather than a guess).

## Phases

### Phase 1: backend opt-in flag
Goal: `AskGlobalCardChatInput` gains `allowGeneralKnowledge?: boolean` (default `false` when
omitted). The service branches the agent's system instructions between two fixed instruction
sets — cards-only (existing) vs. cards-first-then-general-allowed — rather than a runtime string
splice, so the "must say when using outside knowledge" rule lives in a reviewable constant, not
interpolated text. When the flag is true and the agent uses knowledge beyond the supplied cards,
the reply must say so explicitly (state this in the allowed-instructions text, e.g. "if you use
knowledge beyond these cards, say so explicitly at the start of your reply").
Key files: `packages/shared/src/global-card-chat.ts` (schema field), `apps/api/src/mastra/
global-card-chat.agent.ts` (two instruction sets, agent factory takes `allowGeneralKnowledge:
boolean`), `apps/api/src/global-card-chat/global-card-chat.service.ts` (pass the flag through).

### Phase 2: frontend toggle
Goal: a small, clearly-labeled toggle in the chat panel (default off) that sets
`allowGeneralKnowledge` on the next message sent. Persists only for the current panel session (no
new storage — matches the panel's existing no-persistence design).
Key files: `apps/web/src/global-card-chat/global-card-chat-panel.tsx`, `apps/web/src/
global-card-chat/global-card-chat.api.ts`.

## Constraints and risks

- Two fixed instruction constants, not string concatenation — keeps the "cards-only" guarantee
  reviewable as a single, complete block rather than assembled at runtime.
- Default must be `false` at every layer — an omitted field in the request, an unset toggle in the
  UI — never silently true.
- No new persistence.
