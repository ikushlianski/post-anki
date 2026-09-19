---
type: plan
branch: learn-from-doc-site
task: grounded-knowledge-chat--show-grounding-cards
complexity: complex
state: draft
updated: 2026-09-19
---

# Show which cards grounded each chat answer

## What and why

Last coding task under `grounded-knowledge-chat`. The backend already returns `matchedCardIds`
(bare ids) alongside every reply, added specifically so this item wouldn't need a second backend
change — but ids alone can't be rendered; the panel needs the matched cards' actual prompt/topic
to show. Enrich the response to carry that display data, then render it under each assistant
reply so the learner can always see exactly what grounded the answer — never a black box, and,
combined with the general-knowledge toggle's "say so explicitly" rule, makes it visible at a
glance when an answer went beyond the learner's own cards.

## Phases

### Phase 1: enrich the chat response with card display data
Goal: `AskGlobalCardChatResult` gains `matchedCards: { variantId: string; prompt: string;
topicTitle: string }[]` (replacing the bare `matchedCardIds` — same data source
`findTopMatchingCards` already returns, just not discarded before the response is built). Any
other caller of `matchedCardIds` (there should be none yet — this is its first consumer) is
updated in the same change.
Key files: `packages/shared/src/global-card-chat.ts`, `apps/api/src/global-card-chat/
global-card-chat.service.ts`.

### Phase 2: render grounding cards under each reply
Goal: each assistant message in the panel shows a small "Grounded in: <card 1>, <card 2>, ..."
line (or "not grounded in any of your cards" when the list is empty) beneath the reply text,
using the same message the reply arrived with — no extra request.
Key files: `apps/web/src/global-card-chat/global-card-chat-panel.tsx`.

## Constraints and risks

- No new persistence — grounding data lives on the same in-memory message object as the reply.
- Keep the citation list terse (card question text is enough; no need to render the full answer
  inline) — this is a trust signal, not a second reading surface.
