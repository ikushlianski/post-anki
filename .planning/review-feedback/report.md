# Review feedback and extraction memory: implementation report

Plan followed with the coordinator's correction: Reject stays one tap; the reason is asked afterwards.

## What was built

- **One-tap reject, reason afterwards.** Reject (button or `r`) rejects at once as before. The server writes a feedback row at reject time with reason `unspecified` and returns its id. A non-blocking "Rejected. Why?" strip appears at the bottom of the page for 10 seconds (restarts on interaction) with the 8 reason chips, an optional note field and Undo. A chip tap updates the existing row by feedback id (`PATCH /knowledge-bit-feedback/:id`); a note can be added afterwards (Enter or blur re-sends the reason with the note). Ignoring the strip leaves `unspecified`. A newer rejection replaces the strip; the earlier one stays `unspecified`.
- **Undo (done, it was simple).** `POST /knowledge-bits/:id/restore` moves a rejected bit back to pending and deletes its rejection feedback row; the web panel re-inserts the removed card at its original index (or recreates its source group).
- **Feedback table.** `knowledge_bit_feedback`: id, knowledge_source_id, knowledge_bit_id, subject_id, model_id, verdict, reason_code, note, statement, front, back, created_at; three indexes; no foreign keys. Written in the same transaction as the state change for reject, single approve and bulk approve; retries do not duplicate rows.
- **Extraction memory.** Before extraction the pipeline loads feedback for the source's subject (global fallback), builds a `<reviewer_feedback>` block (pure function, hard cap 1500 chars, rejected and approved examples interleaved, rejections without reason labeled "rejected (no reason given)", text escaped, header says data not commands and never overrides SECURITY and LANGUAGE) and puts it before `<source>`. Loading failures are logged and ignored. `reviewer_feedback` was added to the escaped prompt tags.
- **Per-model statistics.** `GET /admin/knowledge-bit-feedback/by-model` and a "Suggestion review by model" section on the Observability page: approved, rejected, reject rate, top 3 reasons per model.
- **Docs.** `docs/architecture/knowledge-bit/review-feedback.md`, including that this is feedback-driven prompting (in-context examples from the reviewer's own decisions), not training or reinforcement learning, effective on the very next extraction.

## Migration

`apps/api/src/db/migrations/0092_natural_night_thrasher.sql` (generated with `npm run db:generate`; creates `knowledge_bit_feedback` and 3 indexes). Not applied to the local Docker DB on 5562 (to be applied by the coordinator after a backup).

## Verification (real outputs)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/api `npx vitest run`: Test Files 154 passed (154), Tests 1436 passed (1436).
- apps/web `npx vitest run`: Test Files 164 passed (164), Tests 1022 passed (1022).
- packages/shared `npx vitest run`: Test Files 7 passed (7), Tests 38 passed (38).
- Integration against the shared pet-projects Postgres (127.0.0.1:5999, throwaway database per file) for `src/knowledge-bit src/knowledge-source src/db`: 28 files, 337 tests, no failures. This includes the new `knowledge-bit-feedback.repo.integration.test.ts` (rejection row with snapshot, subject and source model id, fallback to the admin default model, no duplicate on retry, approval rows single and bulk, reason and note update, refusing a reason on an approval row, restore, scoped and global feedback loading, per-model aggregation).
- Full integration run (`vitest.integration.config.ts`) earlier: 935 passed, 6 failed plus one file that could not load; none relate to this change (see below). The `migrations.integration.test.ts` knowledge_sources column expectation was stale after the earlier `extraction_model_id` column and was fixed (35 passed).

## Existing tests changed

reject now returns `{ ok, feedbackId }` instead of a boolean: updated `knowledge-bit-approval.controller.test.ts`, `knowledge-bit-approval.repo.integration.test.ts`, `knowledge-source-regeneration.repo.integration.test.ts` (also now expects the model option with `objectContaining`, since feedback is real there), orchestrator test fixtures (`subjectId`, `loadFeedbackBlock`), web panel tests (mock shape and the two new mocked API functions).

## Left open

- The pet-projects Postgres container was not running; it was started with its own compose file for the integration runs and was left running.
- Failures in the full integration run that are outside this feature: `src/mcp/search-knowledge-items.integration.test.ts` (3 tests on literal `_`, `%` and backslash search return no rows; likely related to the earlier ILIKE escaping change by the security work, not investigated here) and `src/tag/*` (`OPENROUTER_API_KEY` is required by those files when run directly).
- Edits made before approval are not stored as before/after correction examples yet.
- The card generators that run after extraction (questions, blanks, basic cards) do not read the feedback block yet.
- Feedback `model_id` is the source's extraction model (or the admin default at decision time); a regeneration with another model does not change the source's stored model, so those rows keep the old model id.
- Not run in a real browser; no end-to-end Playwright test was added.

END-OF-REPORT
