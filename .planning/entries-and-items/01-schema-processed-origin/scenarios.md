---
type: scenarios
branch: learn-from-doc-site
task: Schema for processed entries and manual knowledge items
state: confirmed
updated: 2026-10-11
---
# Scenarios: Schema for processed entries and manual knowledge items

Every scenario is `asked` (covered by the two todo items). Unit tests use mocks; integration tests run on the pet-projects Postgres lane 127.0.0.1:5999 in a throwaway database per file, never the local Docker DB on 5562. Test files live in apps/api/src unless noted.

## Business Scenarios

- [x] SCENARIO 1: Mark an entry as processed — asked
  The user marks a reviewed entry as processed and it records when.
  What to verify:
  - The entry gets a processed time and its extraction status, text and subject do not change.
  - The response returns the entry id and the processed time.
  Proved by: `knowledge-source/knowledge-source-processed.repo.integration.test.ts` > "should stamp processed time without touching status or text"; `knowledge-source/knowledge-source-processed.controller.test.ts` > "should answer 200 with the processed time".

- [x] SCENARIO 2: Marking twice changes nothing — asked
  A retry after a lost response succeeds and keeps the first processed time.
  What to verify:
  - Second mark returns 200 with the same time.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should keep the first processed time when marked again".

- [x] SCENARIO 3: Reopen a processed entry — asked
  The user reopens a processed entry and it is open again.
  What to verify:
  - The processed time is cleared, the status stays as it was.
  - Reopening an already open entry returns 200 and changes nothing.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should clear processed time on reopen" and "should accept reopening an open entry".

- [x] SCENARIO 4: Unknown entry — asked
  Marking or reopening an entry that does not exist is a clear not-found.
  What to verify:
  - Both routes answer 404 and nothing is written.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should report not found for a missing entry"; `knowledge-source-processed.controller.test.ts` > "should answer 404 when the entry is missing".

- [x] SCENARIO 5: Entry still being read by the model — asked
  The user cannot mark or reopen an entry while its items are being extracted.
  What to verify:
  - Both routes answer 409 and the entry is unchanged.
  - A failed, finished or queued entry can be marked.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should refuse while the entry is processing"; `knowledge-source-processed.controller.test.ts` > "should answer 409 while the entry is processing".

- [x] SCENARIO 6: Malformed entry id — asked
  An id with odd characters or a huge length is rejected before any database call.
  What to verify:
  - Both routes answer 400 and the repository is not called.
  Proved by: `knowledge-source-processed.controller.test.ts` > "should reject a malformed id without touching the database".

- [x] SCENARIO 7: Review payload tells the web which entries are processed — asked
  The pending-review list carries each entry's processed time and each item's origin so the web can group.
  What to verify:
  - An open entry shows no processed time; a processed entry with leftover pending items shows its time.
  - Each item shows extracted or manual.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should carry processed time and item origin in the pending review list".

- [x] SCENARIO 8: Sidebar count ignores items of processed entries — asked
  The badge counts pending items of open entries only, so marking an entry removes its pending items from the count and reopening restores them.
  What to verify:
  - The count drops by the entry's pending items on mark and returns to the earlier value on reopen.
  - Manual and extracted pending items both count while the entry is open.
  Proved by: `knowledge-source-processed.repo.integration.test.ts` > "should drop the pending count while an entry is processed and restore it on reopen".

- [x] SCENARIO 9: Approving or rejecting a manual item records no model feedback — asked
  Decisions on a hand-made item succeed but leave no feedback row attributed to any model.
  What to verify:
  - Single approve, single reject and bulk approve return success with no feedback id.
  - No feedback row exists afterwards.
  Proved by: `knowledge-bit/knowledge-bit-origin.repo.integration.test.ts` > "should write no feedback row when a manual item is approved, rejected or bulk approved"; `knowledge-bit/knowledge-bit-feedback-origin.test.ts` > "should skip the feedback write for a manual item".

- [x] SCENARIO 10: Grading a manual item is refused — asked
  Card grades describe a model's work, so a manual item cannot be graded.
  What to verify:
  - The grades route answers 409 and no row is created.
  - An extracted item is still graded as before.
  Proved by: `knowledge-bit/knowledge-bit-feedback.controller.test.ts` > "should answer 409 when grading a manual item"; `knowledge-bit-origin.repo.integration.test.ts` > "should refuse grades for a manual item and keep grading extracted items".

- [x] SCENARIO 11: Per-model statistics ignore manual items — asked
  Even if a feedback row for a manual item exists (written by older code or by hand), it never counts toward any model.
  What to verify:
  - The by-model approval and rejection counts exclude it.
  - The model evidence used for the default-model suggestion (averages, approved, rejected) excludes it.
  - The extracted rows beside it are counted exactly as before.
  Proved by: `knowledge-bit-origin.repo.integration.test.ts` > "should exclude manual feedback from by-model counts" and "should exclude manual feedback from default-model evidence".

- [x] SCENARIO 12: Reviewer memory ignores manual items — asked
  The examples fed to the next extraction never include a hand-made card.
  What to verify:
  - Recent decisions and approved examples exclude manual items, for subject-scoped and global scope.
  - The extraction grades still feed the memory unchanged.
  Proved by: `knowledge-bit-origin.repo.integration.test.ts` > "should exclude manual feedback from the reviewer memory examples".

- [x] SCENARIO 13: Feedback report ignores manual items — asked
  The report the user queries by hand never lists a manual item.
  What to verify:
  - The report returns no row for a manual item and still returns extracted rows with their extraction grade.
  Proved by: `knowledge-bit-origin.repo.integration.test.ts` > "should hide manual items from the feedback report view".

- [x] SCENARIO 14: Model comparison is unaffected — asked
  Comparison runs keep their own data, so no change reaches them.
  What to verify:
  - The comparison evidence returns the same figures with manual items present.
  Proved by: `knowledge-bit-origin.repo.integration.test.ts` > "should leave comparison evidence unchanged by manual items".

## Technical/Architectural Scenarios

- [x] SCENARIO 15: Migration is additive and safe on existing data — asked (hard prerequisite of the new fields)
  Applying the migration to a database with existing entries and items leaves them open and extracted.
  What to verify:
  - Existing entries have no processed time; existing items are extracted.
  - An origin other than extracted or manual is rejected by the database.
  - The feedback report view still exists with the same columns.
  Proved by: `db/migrations.integration.test.ts` > "should add processed time and item origin without changing existing rows" and "should reject an unknown item origin".

- [x] SCENARIO 16: Routes sit behind the existing authentication and log no text — asked
  Both routes resolve through the single authorized gate; nothing logs entry text.
  What to verify:
  - Both routes resolve in the route table with the right methods.
  - The handlers and repository never read or log the raw text.
  Proved by: `router.test.ts` > "should resolve the processed routes"; `knowledge-source-processed.controller.test.ts` > "should not log entry text".
