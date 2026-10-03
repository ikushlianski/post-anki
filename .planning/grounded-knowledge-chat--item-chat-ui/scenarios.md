---
type: scenarios
direction: grounded-knowledge-chat
task: "Add a UI entry point to chat with a single knowledge item"
updated: 2026-10-03
---

# Scenarios: single knowledge-item chat UI

## S1 — Opening the panel for the current bit
On `/knowledge/answer`, a "Chat about this" control next to the current bit opens a panel scoped to `current.knowledgeBitId`. Switching to the next bit (via "Next") either closes the panel or re-scopes it — never leaves it answering against the previous bit's id silently.

## S2 — Sending a message gets a grounded reply
Typing a message and sending it calls `POST /knowledge-bits/:id/chat` with the growing transcript, renders the reply, matches the existing global-chat message-bubble styling.

## S3 — General-knowledge toggle
Off by default; toggling it on is passed as `allowGeneralKnowledge` on the next message, same contract as the global chat panel.

## S4 — Request failure doesn't lose the conversation
A failed request (network error, 404 for a since-deleted bit) shows a fallback message in the thread rather than throwing/crashing the screen — same pattern as `global-card-chat-panel.tsx`'s `onError`.

## Files by scenario
| Scenario | Files |
|---|---|
| All | `apps/web/src/knowledge-bit/knowledge-bit-chat.api.ts` (new), `apps/web/src/knowledge-bit/knowledge-bit-chat-panel.tsx` (new), `apps/web/src/routes/knowledge.answer.tsx` |
