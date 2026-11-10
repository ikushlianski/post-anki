# Compare models page: report

Nothing committed. `apps/api/.env` untouched. The local Docker DB on 5562 was not touched: migration 0094 is generated but NOT applied there (the coordinator applies it after a backup). Integration tests ran on the pet-projects Postgres lane (127.0.0.1:5999, a throwaway database per file) only.

## What was built

- **Migration `apps/api/src/db/migrations/0094_model_comparison.sql`** (generated with drizzle-kit, never pushed; snapshot `meta/0094_snapshot.json`, journal updated): tables `model_comparison_run`, `model_comparison_result` (unique run+model, extraction grade check 1..5), `model_comparison_card_grade` (unique run+model+card, two checks 1..5), and the read-only view `model_comparison_report` (raw SQL appended to the migration, declared with `.existing()` in `db/schema.ts` like `knowledge_feedback_report`). No foreign keys.
- **Shared** `packages/shared/src/model-comparison.ts`: grade inputs (1..5, at least one field), run summary and detail types, list limit and preview constants.
- **API** `apps/api/src/model-comparison/`: `model-comparison.repo.ts` (save run with results in one transaction, list latest 20, get with grades, grade a model result, upsert a card grade, evidence loader for the suggestion), `model-comparison.controller.ts`, six routes registered in `router.ts`, `router-table.ts`, `api-server.ts`: `POST /admin/model-comparison/estimate`, `POST /admin/model-comparison/runs` (400 `over_cost_cap` before any model call), `GET /admin/model-comparison/runs`, `GET /admin/model-comparison/runs/:id`, `PATCH .../results/:modelId/grade`, `PATCH .../results/:modelId/cards/:index/grade`. Run id must be a UUID, model id (URL-decoded) must be on the allowlist, card index 0..99 and must exist in the stored result.
- **Suggestion** `apps/api/src/knowledge-bit/knowledge-bit-model-suggestion.ts`: each graded comparison result counts as one graded run for its model; extraction, card quality and wording averages are blended with the app's averages weighted by graded runs (equal weight per graded run); retired models are ignored. `packages/core` was not changed (the pure function is unchanged).
- **Web** `apps/web/src/model-comparison/`: `model-comparison-page.tsx` (excerpt textarea with counter, picker with nothing preselected, debounced cost estimate, Run disabled until a model is chosen or when over the cap, "Running…" state, results with grade controls, list of earlier runs), `model-comparison-grade-picker.tsx`, `model-comparison-card-grades.tsx`, `model-comparison-extraction-grade.tsx` (grade plus note autosave through the review page's `useAutoSave`), `use-model-comparison-estimate.ts`, `model-comparison-runs-list.tsx`, `model-comparison.api.ts` (server functions), client functions appended to `curriculum/api-client.ts`, route `routes/admin-compare-models.tsx` (the route tree regenerated itself), a link section on the admin settings page.
- **Docs** `docs/architecture/model-comparison/model-comparison.md` in final form, with the storage description and four example queries (all run in an integration test).

## Verification (real outputs)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/api unit: Test Files 159 passed (159), Tests 1505 passed (1505).
- apps/web: Test Files 173 passed (173), Tests 1119 passed (1119).
- packages/shared: Tests 38 passed (38). packages/core: Test Files 126 passed (126), Tests 1092 passed (1092).
- Integration on the pet lane: `src/model-comparison` plus `src/db`: Test Files 3 passed (3), Tests 50 passed (50). The repo integration test covers saving and ordering, listing and preview, failed model storage, grade upserts and clearing a note, unknown model and card positions, the database check constraint (grade 6 rejected), the evidence rows (only graded results, per-run card averages), the report view and the documented example queries.
- New tests: controller (bad ids, no model, over the excerpt cap, over the cost cap without calling a model, grades 0 and 6 and 2.5, empty grade, unknown model in the path, bad card position), suggestion blending (4 cases), grade picker (3), card grades (2), extraction grade (3), page states (9: no model, character counter, estimate shown, over the cap, running then results with saved grades, request payload, run failure, card grade saved on the server, grade save failure keeps the value).

## Left open

- Migration 0094 must be applied to the local dev DB after a backup, then the Electric container restarted.
- No real-browser or Playwright run; the page is covered by jsdom tests only.
- Cost is an estimate (about 2.5 characters per token, 1500 output tokens per chunk); actual token usage per model is not stored for comparison runs.
- A failed model shows no grade controls (only successful models can be graded).
- "Admin only" means the same authenticated API as the admin settings page; the app has no role system.
- The excerpt is stored as typed in `model_comparison_run.excerpt` (not shown anywhere unescaped; the page renders it only through React text).
- The review-page feedback block is deliberately not used in comparison runs, so a comparison does not show the effect of the memory.

END-OF-REPORT
