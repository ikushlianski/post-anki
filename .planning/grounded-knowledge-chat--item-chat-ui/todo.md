---
type: todo
direction: grounded-knowledge-chat
task: "Add a UI entry point to chat with a single knowledge item"
updated: 2026-10-03
---
## Coding tasks
- [ ] Add `apps/web/src/knowledge-bit/knowledge-bit-chat.api.ts` calling `POST /knowledge-bits/:id/chat`.
- [ ] Build `KnowledgeBitChatPanel`, reusing `global-card-chat-panel.tsx`'s pattern, scoped to one bit id.
- [ ] Wire the panel into `/knowledge/answer` next to the current bit.
- [ ] Unit/RTL tests for the panel and api-client function.
- [ ] Verify in a real browser via `/check-ui` before marking done.
## Notes
- Draft create/edit-from-chat and web-search toggle are deliberate follow-ups, not this unit — see spec.md.
