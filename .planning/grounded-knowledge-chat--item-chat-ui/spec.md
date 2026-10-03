---
type: spec
direction: grounded-knowledge-chat
task: "Add a UI entry point to chat with a single knowledge item"
updated: 2026-10-03
---

# Spec: single knowledge-item chat UI

## Facts
- `POST /knowledge-bits/:id/chat` (`apps/api/src/knowledge-bit/knowledge-bit-chat.controller.ts`) is fully built, tested, and registered (`router-table.ts:255`) — request `{message, transcript?, allowGeneralKnowledge?, allowWebSearch?}` (`packages/shared/src/knowledge-bit-chat.ts`), response `{reply: string}`.
- Grepping the entire `apps/web` tree for any caller of this route, or of `/knowledge-bits/:id/chat/draft` (the sibling create/edit-from-chat endpoint), finds none — this backend work shipped with zero frontend usage.
- `apps/web/src/global-card-chat/global-card-chat-panel.tsx` is a working, tested reference pattern for exactly this shape (floating panel, message list, transcript-in-request, general-knowledge toggle) — reuse its structure, not the global-scoped floating-button placement.
- `apps/web/src/routes/knowledge.answer.tsx` already has `current.knowledgeBitId` and `current.bitBody` in scope per question — the natural place to surface "chat about this item," since that's the one screen where a learner already sees one bit at a time.

## Decision made autonomously
Scope this to core chat only (message in, reply out, with the existing `allowGeneralKnowledge` toggle, mirroring the global chat's own UI) — the draft create/edit-from-chat endpoint and the `allowWebSearch` toggle are real, already-built backend capabilities but add their own UI surface; left as a follow-up item rather than bundled in here, per `/autonomous`'s default-to-smaller-reversible-step preference under a live correction from the user about scope.

## Scope
- A per-item chat panel on `/knowledge/answer`, scoped to `current.knowledgeBitId`, toggled open/closed like the global chat panel.
- Calls `POST /knowledge-bits/:id/chat` via a new `apps/web/src/knowledge-bit/knowledge-bit-chat.api.ts` server function.
- Includes the existing `allowGeneralKnowledge` toggle (backend already supports it, costs nothing extra to wire).

## Out of scope
- The draft create/edit-from-chat flow (`/knowledge-bits/:id/chat/draft`) — a real follow-up, not bundled here.
- `allowWebSearch` toggle — same reasoning.
- Any change to the backend chat endpoints themselves — already correct and tested.
