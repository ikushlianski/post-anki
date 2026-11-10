# Grades, extraction grades, report view and evidence-based default model: report

Same rules as before: nothing committed, `apps/api/.env` untouched, the local Docker DB on 5562 untouched (the migrations are for the coordinator to apply after a backup), security hardening intact (feedback, notes and grades are validated; text that reaches a prompt is flattened, capped and escaped).

## Scope changes that were applied

- No observability page work: the "Suggestion review by model" table is exactly as it was, there is no history list, no per-source grade list and no extra columns. The data is reachable through a read-only SQL view instead (see below).
- Approve gets no Undo: approving starts background work on the card (embedding, tagging, question generation), so it is not a simple revert. Undo stays for rejections only.

## What was built

1. **Grades on both decisions.** Approve and reject stay one tap. The strip (about 10 seconds, kept open while the reviewer interacts) offers "Card quality" and "Question wording", each 1 to 5 ("1 poor, 5 excellent"), for approve and for reject. Reject also keeps the reason chips, the note and Undo. Keys 1 to 5 grade the card quality of the latest decision while the strip is visible, never while typing in a field; wording has no key.
2. **Grades on pending cards.** Each pending card shows the two grade rows under its fields with the saved values (filled button plus a small `n/5`). A grade given before the decision creates the feedback row with verdict `pending`; approve or reject promotes that same row, so nothing is lost or duplicated.
3. **Source extraction grade.** The source header shows "How well was this text split into cards?" with a 1 to 5 grade and an optional note, editable at any time. Stored per (source, run) in `knowledge_source_extraction_grade`; a regeneration increments `knowledge_sources.extraction_run`, so the new run starts without a grade and each run is graded on its own. The regeneration now also stores the chosen model on the source, so the new run, its feedback and its grade are attributed to that model.
4. **Persistence and visibility.** Every grade is saved on the server when it changes. A failed save shows an error and keeps the chosen value selected and editable. The pending-review payload carries each card's feedback (id, rating, wording rating) and each source's current run and grade, so a reload shows exactly what was saved.
5. **Memory.** The `<reviewer_feedback>` block now shows ratings next to examples ("approved, rated 5/5, wording 2/5", "rejected, rated 4/5, Bad format"), prefers the highest-rated approved examples, lists up to two low-rated approvals as "approved but weak", and adds one line with the average of recent text-splitting grades and the latest low grade's note. Cap 1500 characters, escaping unchanged.
6. **Report view and docs.** `knowledge_feedback_report` (created in migration 0093, declared as an existing view in the Drizzle schema) joins decided rows with subject name, model, ratings, reason, note, snapshots, run number and the extraction grade of that run. `docs/architecture/knowledge-bit/review-feedback.md` has five ready-to-run example queries (average ratings per model, reject reasons per model, recent decisions, extraction grades per source run, graded runs behind the default-model suggestion); an integration test runs all five against a real database so they cannot rot.
7. **Evidence-based default model.** Pure function `suggestDefaultModel` in `packages/core/src/model-suggestion` with the constants `MIN_MODELS_FOR_SUGGESTION = 5` and `MIN_GRADED_RUNS_PER_MODEL = 3` (a graded run is one extraction grade row attributed to the model of that run). Score: extraction 40%, card quality 25%, question wording 20%, approval rate scaled to 1..5 15%, missing components ignored and weights renormalised; models within 0.1 of the best are tied and the cheaper (input plus output price) wins; only models with at least 3 graded runs are eligible. `GET /admin/knowledge-bit-model-suggestion` builds it from the tables with prices from the shared model list (removed or expired models are left out).
8. **Admin settings UI.** Next to the model select: "Not enough grades yet: 3 of 5 models have 3 graded runs" with a collapsed per-model progress list ("needs N more graded runs"), or "Suggested default: <model> (score 4.3, based on 18 graded runs across 5 models)" with a "Use as default" button through the existing setting call. Never switches by itself.
9. **Empty model dropdowns.** On "Add knowledge" and in the Regenerate confirm step the dropdown starts empty ("Choose a model"), the default option is gone, submit or Replace stays disabled with a short hint until a model is chosen, and the UI never sends a request without a model. Only the evidence-based suggestion is preselected and marked "(suggested)", still changeable. The suggestion is fetched only when the form or the confirm step opens. The server still accepts a missing `modelId` (falls back to the admin default, as before), and the admin default stays the fallback for background paths.

## Migrations

- `apps/api/src/db/migrations/0092_natural_night_thrasher.sql` (from the previous task, content unchanged: `knowledge_bit_feedback` and three indexes; the file and its snapshot were regenerated from the 0092 schema state because the numbering had to stay as already reported).
- `apps/api/src/db/migrations/0093_feedback_grades_and_report.sql`: new table `knowledge_source_extraction_grade`; columns `knowledge_bit_feedback.extraction_run`, `.rating`, `.wording_rating`; `knowledge_sources.extraction_run` (default 1); indexes; check constraints `rating between 1 and 5` on both rating columns and on the extraction grade; the `knowledge_feedback_report` view appended as raw SQL. Neither is applied to the 5562 database.

## Verification (real outputs)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/api unit: Test Files 158 passed (158), Tests 1482 passed (1482).
- apps/web: Test Files 169 passed (169), Tests 1101 passed (1101).
- packages/shared: Test Files 7 passed (7), Tests 38 passed (38).
- packages/core: Test Files 126 passed (126), Tests 1092 passed (1092) (includes 14 new tests for the suggestion function).
- Integration suite on the shared pet-projects Postgres lane only (127.0.0.1:5999, a throwaway database per file): `knowledge-bit-feedback.repo.integration.test.ts` 41 passed, covering grade upsert and promotion on approve and reject, changing one grade without the other, check constraints rejecting 0 and 6 for both grades and for the extraction grade, the update endpoint refusing a reason on an approval row, restore keeping grades, the payload carrying card grades and the source grade, extraction grade upsert and run numbering across a regeneration with separate models, model evidence aggregation, the report view contents and the five documented queries. Full integration run: 125 files passed, 2 files failed (see below), Tests 969 passed, 2 failed.
- Tests added or rewritten: strip behavior for approve and reject, keys 1 to 5 and their being ignored while typing or when no strip is visible, API validation (grades 0, 6, 2.5 and -1 rejected, empty update rejected, wrong reason codes, note cap), repo update, memory block with ratings and caps, regeneration model attribution, grade control, source extraction control, admin suggestion note states, evidence builder, empty-by-default dropdowns and suggestion preselect in both forms, and a test that a grade survives a reload through the API payload.

## Existing tests changed

`approveKnowledgeBit` now returns `{ ok, feedbackId }` (controller, repo integration and regeneration integration tests updated), `claimSourceForRegeneration(id, { modelId })` (controller test), the knowledge_sources column list gained `extraction_run`, the add-knowledge and regeneration tests choose a model before submitting, and the old "default model" option tests were replaced by the empty-dropdown tests.

## Left open

- The 2 failing integration tests (`src/tag/tag-race-recovery.integration.test.ts`) and the file that does not load (`tag-taxonomy-cap-concurrency`) need `OPENROUTER_API_KEY` in the environment; unrelated to this work. The earlier search-knowledge-items failures did not reproduce on this run.
- A regeneration after this change stores the chosen model on the source; sources that had been regenerated earlier keep their old model attribution in older feedback rows.
- Feedback rows written before migration 0093 have no `extraction_run`, so the view shows no extraction grade for them.
- The per-card Example field is still shared by all cards of one statement.
- No real-browser or Playwright run was done; the web behavior is covered by jsdom tests.

END-OF-REPORT
