---
type: scenarios
direction: prose-knowledge-fisher
task: "Knowledge-item approval gate"
---

# Scenarios

1. **New bit lands pending.** Paste prose → bits detected → each new `knowledgeBits` row has
   `approvalState: "pending"`. Confirms the default, not a per-insert-call opt-in that could be
   missed.
2. **Pending bit never answers.** `listNextQuestionVariantsToAnswer` excludes a pending bit's
   variants, even once they're generated.
3. **Pending bit never chats.** `knowledge-bit-chat.service.ts` returns a clear "not approved" error
   for a pending bit, distinct from the existing "not found" error.
4. **Pending bit never appears in search/browse/MCP.** Each of `searchKnowledgeBitsRanked`,
   `searchByTagNameAcrossNodes`, `listNodesByTagId`, and the MCP `search-knowledge-items` tool
   excludes a pending bit.
5. **Generation still happens for pending bits.** Tagging/embedding/wh-question/fill-blank claims
   still pick up a `pending` bit — the review screen has real Q&A to show, not a blank state.
6. **Rejected bit stops generation.** A `rejected` bit is excluded from every future generation
   claim query (no further spend on content the learner declined).
7. **Approve flips visibility.** Approving a pending bit makes scenarios 2-4 immediately pass for
   that bit, with no other state change.
8. **Reject removes it from the queue, keeps the row.** A rejected bit never reappears in the review
   screen or any learner-facing surface; the row itself is kept (soft state, not a delete).
9. **Edit a question variant supersedes, doesn't mutate.** Editing a variant's text creates a new
   variant row and marks the old one superseded; the old row's text is never overwritten in place.
10. **Edit the bit's own text updates in place.** Editing a pending bit's body/background is a plain
    update — no superseding needed, since no attempts can exist yet.
11. **Existing bits default to pending, not approved.** A bit created before this unit shipped shows
    up in the review queue the same as a brand-new one — confirms the migration's default, not a
    backfill that marks history as pre-approved.
12. **Attempt-recording defends itself.** A direct call to record an attempt against an unapproved
    bit's variant is rejected, even bypassing the normal answer-listing path.

## Files by scenario

| Scenario | Files |
|---|---|
| 1, 11 | `apps/api/src/db/schema.ts`, new migration |
| 2 | `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts` |
| 3 | `apps/api/src/knowledge-bit/knowledge-bit-chat.service.ts`, `knowledge-bit-chat-draft.service.ts` |
| 4 | `apps/api/src/search/search-tag-and-bit.repo.ts`, `apps/api/src/search/list-nodes-by-tag.repo.ts`, `apps/api/src/mcp/search-knowledge-items.tool.ts` |
| 5, 6 | `apps/api/src/knowledge-bit/knowledge-bit-tagging.repo.ts`, `knowledge-bit-embedding.repo.ts`, `knowledge-bit-wh-question-claim.repo.ts`, `knowledge-bit-fill-blank-claim.repo.ts`, `knowledge-bit-placement.repo.ts` |
| 7, 8 | new `knowledge-bit-approval.repo.ts` + `.controller.ts`, `router-table.ts` |
| 9 | `knowledge-bit-question-variant.repo.ts` (reuse existing supersede mechanism) |
| 10 | `knowledge-bit.repo.ts` |
| 12 | `knowledge-bit-variant-attempt.repo.ts` |
| Review screen | new `apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx` (pattern: `placement-suggestions-panel.tsx`), new route, `apps/web/src/curriculum/api-client.ts` |
