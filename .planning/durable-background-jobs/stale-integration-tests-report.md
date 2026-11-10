# Stale integration tests: report

Scope: apps/api integration suite, 12 failing tests. Product code changed in 3 files (3 regressions, below). Nothing staged or committed.

## Per file

1. `src/db/migrations.integration.test.ts` (2 tests). Stale test. The expected column lists lacked columns that `src/db/schema.ts` declares. Added to `knowledge_sources`: `extraction_run` (integer, not null, default 1), `processed_at`, `source_url`, `summary`. Added to `knowledge_bits`: `origin` (not null, default 'extracted'), `is_ai_generated` (boolean, not null, default false), `source_links` (jsonb). Each column was checked against `schema.ts`, and the order matches the table order.

2. `src/knowledge-bit/knowledge-bit-approval.repo.integration.test.ts` (1 test). Stale test. A pending bit now needs an active question variant before it can be approved. The approve test now seeds a `basic` variant first, the same way the existing helper does.

3. `src/knowledge-bit/knowledge-bit-origin.repo.integration.test.ts` (2 tests).
   - Approve test: stale test. `approveKnowledgeBit` returns `true` now, not `{ ok, feedbackId }`. Both approve assertions (manual and extracted) now expect `true`. The feedback-row counts (0 for manual, 1 for extracted) are unchanged. The bits in this file already had variants. `rejectKnowledgeBit` still returns an object, so that assertion is unchanged.
   - Reviewer-memory test: **regression** in product code. `RecentFeedback.extractionGrades` is declared in `knowledge-bit-feedback.types.ts`, but `loadScope` in `knowledge-bit-feedback.repo.ts` never filled it. Fix: `loadScope` now also reads `knowledge_source_extraction_grade` (scoped by subject when one is given, newest first, limited to the recent window) and returns it as `extractionGrades`. The test is unchanged.

4. `src/knowledge-source/knowledge-source-processed.repo.integration.test.ts` (2 tests). **Regression** in product code. The brief says the sidebar badge counts only open items, and the pending-review list carries `processedAt`. Neither held.
   - `countPendingKnowledgeBits` in `knowledge-bit-bulk-approval.repo.ts` now excludes pending bits whose source has `processed_at` set.
   - `listPendingKnowledgeBitsForReview` in `knowledge-bit-approval.repo.ts` now returns `processedAt` (ISO string or null) for each source. A processed source is returned with `bits: []`.
   - The tests are unchanged.
   - The API never produces a processed source that still has pending bits, because marking is refused with 409 `pending_items`. So the user-visible effect is mostly defensive.

5. `src/knowledge-source/knowledge-source-regeneration.repo.integration.test.ts` (3 tests). Stale test.
   - Approve and reject on a superseded bit now returns `"blocked"` (was `false`). Editing a variant of a superseded bit returns `{ error: "blocked" }` (was `not_found`). Both assertions were updated.
   - The pending-bit decision test seeds a variant before approving. Rejecting a pending bit needs no variant. The later approve of a rejected bit expects `"blocked"`.
   - The second-generation test seeds a variant for the bit it approves and now asserts that the approve returned `true`.
   - The spy-call mismatch was a retired model id. `openrouter/google/gemini-2.5-flash-lite` is rejected by `knowledgeItemModelIdSchema`, which has a test saying so, so `modelId` was dropped from the options. The test now uses `openrouter/google/gemini-3.1-flash-lite`. The options also carry a `feedbackBlock`, which the existing `objectContaining` already tolerates.

6. `src/tag/tag-race-recovery.integration.test.ts` (2 tests). Stale test. It never set `OPENROUTER_API_KEY`, so env validation threw when the repo opened the pool. Added `process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test"` after the `DATABASE_URL` assignment and before the dynamic imports.

7. `src/tag/tag-taxonomy-cap-concurrency.integration.test.ts` (load failure). Stale test, same cause and same fix as item 6.

## Results

- Full integration suite (`vitest.integration.config.ts`), one run: 141 files passed, 1072 tests passed, 0 failed. The known flake did not appear, so no reruns were needed.
- Unit tests for the touched approval, feedback and bulk-approval repos: 7 files, 48 tests passed.
- `npx tsc --noEmit` in apps/api: exit 0, no errors.

END-OF-REPORT
