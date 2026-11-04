---
type: spec
branch: learn-from-doc-site
task: Schema for processed entries and manual knowledge items
complexity: complex
state: confirmed
updated: 2026-10-11
---
# Spec: Schema for processed entries and manual knowledge items

### Summary
An entry (a pasted or uploaded text) can be marked processed by the user and reopened later; the system records only when, and never decides it on its own. Every knowledge item now says whether the model extracted it or the user wrote it, and hand-made items are kept completely out of model statistics, reviewer memory and the default-model suggestion. This feature is the data and API foundation only; screens and the hand-made item route come in later items.

### The ask
Todo items covered (plan `.planning/entries-and-items/brief.md`):
1. "Add processed_at to entries and a Mark as processed action"
3. "Mark manual knowledge items and keep them out of model statistics"

### What to do
1. Generate migration 0096 with drizzle (`npm run db:generate` in apps/api, never push, never apply to the local Docker DB on 5562; the coordinator applies it after a backup). It adds `knowledge_sources.processed_at timestamptz null` and `knowledge_bits.origin text not null default 'extracted'` with a check constraint (`extracted`, `manual`). Append, in the same SQL file, a `CREATE OR REPLACE VIEW knowledge_feedback_report` with identical columns and a `NOT EXISTS` filter dropping feedback whose bit has origin `manual` (same raw-SQL pattern as migrations 0093 to 0095). No new index: processed_at is read by entry id; origin is only a filter after a primary-key join.
2. Routes (behind the existing `authorized` gate, api-server.ts:399): `POST /knowledge-sources/:id/processed` marks, `DELETE /knowledge-sources/:id/processed` reopens. Id validated with the same `^[A-Za-z0-9_-]{1,100}$` rule as knowledge-source-text.controller.ts:5, 400 `invalid_id`. One conditional UPDATE (`status <> 'processing'`), mark uses `coalesce(processed_at, now())` so a retry keeps the first time; reopen sets null. No row updated: a second SELECT by id gives 404 `not_found` (absent) or 409 `entry_processing`. Success: 200 `{ id, processedAt }` (`null` after reopen). Neither route reads, selects or logs `raw_text`; `updated_at` and `status` are untouched (updated_at only drives the stale-processing reset).
3. Payload: `PendingKnowledgeSourceForReview` gets `processedAt?: string | null` and `PendingKnowledgeBitForReview` gets `origin?: "extracted" | "manual"` (optional so existing web fixtures compile); `listPendingKnowledgeBitsForReview` fills both. The entry list does not exist as a GET today (only POST /knowledge-sources creation, apps/web/src/curriculum/api-client.ts:680-702), so the pending-review payload is the single carrier; a list endpoint is out of scope.
4. Sidebar count: `countPendingKnowledgeBits` counts `approval_state = 'pending'` rows (knowledge-bit-bulk-approval.repo.ts:80-87) and excludes pending items of processed entries (`processed_at IS NULL` on the entry, knowledge-bit-bulk-approval.repo.ts:85), so marking drops them from the badge and reopening restores them. A test pins it.
5. Manual exclusion, write side: `recordKnowledgeBitFeedback` (knowledge-bit-feedback.repo.ts:121) loads the bit's origin in `loadDecisionContext` (:42) and returns `null` without inserting for `manual`; approve, reject (knowledge-bit-approval.repo.ts:56, :85) and bulk approve (knowledge-bit-bulk-approval.repo.ts:47) already tolerate a null feedback id. `upsertKnowledgeBitGrades` (:188) refuses a manual bit; the controller answers 409 `grades_not_applicable` (chosen over a 200 with a null id because the shared grades response requires a string id and the web panel at knowledge-bit-review-panel.tsx:249-256 reads it; no web change needed).
6. Manual exclusion, read side: add one shared predicate (new file `knowledge-bit-feedback-exclusion.ts`, `NOT EXISTS` knowledge_bits origin `manual` for the feedback row's `knowledge_bit_id`) and apply it to every reader of `knowledge_bit_feedback`:
   - `loadScope` recent and approved queries (:329-352): builds the reviewer memory block (consumer detect-knowledge-bits.orchestrator.ts:60, rendering in knowledge-bit-review-feedback-block.ts, pure over rows).
   - `aggregateFeedbackByModel` (:376): per-model approval and rejection counts (controller :80).
   - `loadModelEvidenceRows` decisions query (:414-424): input of `getModelSuggestion` (knowledge-bit-model-suggestion.ts:94), the default-model suggestion.
   - the `knowledge_feedback_report` view (migration).
   Needs no filter (verified): `knowledge_source_extraction_grade` readers (loadScope :346, loadModelEvidenceRows :406, approval repo :234) because a grade is per entry run, never per item; `loadModelEvidenceRows` extraction query likewise; `model_comparison_*` tables, `loadComparisonEvidenceRows` (model-comparison.repo.ts:210) and `model_comparison_report` store their own card JSON and never join knowledge_bits. Other feedback touchers (`latestFeedbackRow` :99, `updateKnowledgeBitFeedback` :256, `restoreRejectedKnowledgeBit` :293, review payload :224) address one existing row by id or bit id and cannot create a manual row.
7. Schema and shared: add the two columns and the check to apps/api/src/db/schema.ts (entry at :1085-1111 with id, kind, raw_text, status, subject_id, extraction_model_id, extraction_run, updated_at; item at :1121 with approval_state at :1133). Add `knowledgeBitOriginSchema` (`z.enum`) and the mark/reopen response schema to packages/shared.
8. Docs: update review-feedback.md (manual items excluded, write and read side), domain-vocabulary.md (processed_at and origin in the names table).

Verified facts (code): the entry is `knowledge_sources` with the columns above (schema.ts:1085-1110); KIs are `knowledge_bits` (:1121) plus `knowledge_bit_question_variants` (:1210); feedback writers are only the two functions named above; no other code reads `knowledge_bit_feedback` (grep over apps, packages, scripts; scripts/clear-extraction-data.sh only deletes).

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| Entry id check (existing pattern) | id string | valid or `invalid_id` | 6 |
| Processed transition | entry status, current processed_at, action | updated entry, `not_found` or `entry_processing` | 1, 2, 3, 4, 5 |
| Feedback eligibility | item origin | write or skip | 9, 10 |
| Manual-origin exclusion predicate | feedback row | included or excluded | 11, 12, 13 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| 1, 2, 3, 4, 5 | knowledge-source-processed repo and controller; router-table.ts, router.ts, api-server.ts | None | None |
| 6, 16 | knowledge-source-processed.controller.ts; router-table.ts | None | None |
| 7 | knowledge-bit-approval.repo.ts; packages/shared knowledge-bit.ts | None | None |
| 8 | knowledge-bit-bulk-approval.repo.ts (processed predicate, pinned by test) | None | None |
| 9, 10 | knowledge-bit-feedback.repo.ts and controller | None | None |
| 11, 12, 13, 14 | knowledge-bit-feedback-exclusion.ts; knowledge-bit-feedback.repo.ts; migration 0096 view | None | None |
| 15 | schema.ts; migration 0096 and snapshot; _journal.json | None | Migration applied by coordinator |

### Footprint
Create:
- apps/api/src/db/migrations/0096_entry_processed_and_item_origin.sql
- apps/api/src/db/migrations/meta/0096_snapshot.json
- apps/api/src/knowledge-source/knowledge-source-processed.repo.ts
- apps/api/src/knowledge-source/knowledge-source-processed.controller.ts
- apps/api/src/knowledge-source/knowledge-source-processed.controller.test.ts
- apps/api/src/knowledge-source/knowledge-source-processed.repo.integration.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-feedback-exclusion.ts
- apps/api/src/knowledge-bit/knowledge-bit-feedback-origin.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-origin.repo.integration.test.ts
- packages/shared/src/knowledge-bit-origin.ts
- packages/shared/src/knowledge-bit-origin.test.ts

Edit:
- apps/api/src/db/schema.ts
- apps/api/src/db/migrations/meta/_journal.json
- apps/api/src/db/migrations.integration.test.ts
- apps/api/src/router-table.ts
- apps/api/src/router.ts
- apps/api/src/router.test.ts
- apps/api/src/api-server.ts
- apps/api/src/knowledge-bit/knowledge-bit-feedback.repo.ts
- apps/api/src/knowledge-bit/knowledge-bit-feedback.controller.ts
- apps/api/src/knowledge-bit/knowledge-bit-feedback.controller.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts
- packages/shared/src/knowledge-bit.ts
- packages/shared/src/index.ts
- docs/architecture/knowledge-bit/review-feedback.md
- docs/architecture/knowledge-bit/domain-vocabulary.md

Many of the edited files already carry uncommitted changes in the worktree; edit surgically and never revert them.

### Files to create
See Footprint. New repo and controller files stay under 150 lines each.

### Files to modify
See Footprint. Must not change: regeneration claim, extraction insert (relies on the column default), model-comparison code, the extraction grade code, eslint/prettier/tsconfig.
  used by (api-server dispatch, feedback repo): feedback repo is imported by approval, bulk approval, suggestion and controller; tests: knowledge-bit-feedback.repo.integration.test.ts, knowledge-bit-feedback.controller.test.ts, knowledge-bit-review-feedback-block.test.ts exist and must stay green.

### Data model changes
- `knowledge_sources.processed_at timestamptz null`.
- `knowledge_bits.origin text not null default 'extracted'`, check `origin in ('extracted','manual')` (name `knowledge_bits_origin_check`).
- `knowledge_feedback_report` replaced, same columns, manual items filtered.

### Security pass
- Ids: validated with the existing pattern before any query; queries are parameterized by drizzle.
- No raw text: the routes select only id, status, processed_at; error logs carry the entry id, never text.
- Auth: both routes go through the global `authorized` gate like every route; no public path added; CORS already allows POST and DELETE (api-server.ts:372).
- Least privilege: the routes cannot create items or change status; manual items can never reach model-attributed data.
- No agentic or model call is added, so no token cost, prompt-injection surface or loop risk; the only agentic touchpoint is the reviewer memory block, which gets strictly fewer inputs.

### Test list
Unit (vitest, mocks, `describe`/`it should`):
- `knowledge-source/knowledge-source-processed.controller.test.ts`: 200 mark, 200 reopen, 400 invalid id with repo not called, 404, 409, no entry text logged.
- `knowledge-bit/knowledge-bit-feedback-origin.test.ts`: manual skips the feedback write; extracted still writes; the exclusion predicate is applied by each reader (query built with the predicate).
- `knowledge-bit/knowledge-bit-feedback.controller.test.ts`: 409 `grades_not_applicable` for a manual item.
- `router.test.ts`: both routes resolve with the right methods and the id param.
- `packages/shared/src/knowledge-bit-origin.test.ts`: only extracted and manual parse.

Integration (pet-projects Postgres 127.0.0.1:5999, throwaway database per file, every migration applied; never 5562):
- `knowledge-source/knowledge-source-processed.repo.integration.test.ts`: mark, idempotent mark, reopen, idempotent reopen, 404, 409 processing, status and updated_at unchanged, payload carries processedAt and origin, pending count drops on mark and is restored on reopen.
- `knowledge-bit/knowledge-bit-origin.repo.integration.test.ts`: manual approve, reject and bulk approve write no feedback row; grades refused; seeded legacy manual feedback row excluded from by-model counts, model evidence, memory examples (subject and global scope) and the report view while extracted rows are counted; comparison evidence unchanged.
- `db/migrations.integration.test.ts`: additive migration keeps old rows open and extracted, check rejects an unknown origin, view columns unchanged.
Run: `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects npx vitest run --config vitest.integration.config.ts <file>` from apps/api; unit: `npx vitest run <file>`; then `npx tsc --noEmit` and the project lint, both clean.

### Risk & rollout
- Blast radius: the four readers of feedback change; the existing integration tests for feedback, grades and memory are the regression net (scenario 11 asserts extracted figures are unchanged).
- Migration 0096 must be applied by the coordinator after a backup of the local Docker DB (5562) before the new API runs against it; tests never touch that DB.
- Rollback: see architecture.md "Rollback note".
- No secret or config needed.

### Documentation changes
- docs/architecture/knowledge-bit/review-feedback.md: manual items are never recorded and always filtered; report view definition.
- docs/architecture/knowledge-bit/domain-vocabulary.md: add `processed_at` and `origin` to the names table; no new doc file.

### Decisions made autonomously
- Manual feedback: skip at write time AND exclude at read time (not a null model) — a null model would still pollute approval counts and memory; double guard survives old code and direct inserts.
- Read exclusion by `NOT EXISTS manual` rather than an inner join to the item — rows whose item is gone stay counted exactly as today.
- Mark route is `POST .../processed`, reopen is `DELETE .../processed` — as requested; a sub-resource path, no verbs.
- Mark is idempotent and keeps the first timestamp; reopen of an open entry is 200 — safe retries after a lost response, same convention as approve.
- Only status `processing` blocks mark and reopen (queued `pending` and `failed` allowed) — literal reading of the ask; 409 code `entry_processing`.
- `updated_at` and status untouched — updated_at drives stale-processing recovery.
- Grades on a manual item answer 409 instead of 200 with null id — keeps the shared response type and the web unchanged; the later UI item hides grade controls using the payload origin.
- `processedAt` and `origin` are optional in the shared payload types — existing web fixtures keep compiling.
- No GET entry list added; pending-review payload carries processedAt — none exists today, web items own list needs.
- Sidebar count ignores items of processed entries and is pinned by test — a processed entry is done, so its leftover pending items must not keep the badge lit; reopening restores them.
- No index on either new column — filters run after a primary-key lookup, tables are small.
- Migration name `0096_entry_processed_and_item_origin` via drizzle `--name`; the view is appended as raw SQL, as in 0093 to 0095.
- Grill phase: the grill-plan subagent is not available in this dispatch (no Agent tool); the plan was self-critiqued against the brief and the code instead.
- Consistency gate run inline: all four checks pass, state set to confirmed.

### Implementation order
1. Shared origin schema and test (scenario 15 groundwork).
2. schema.ts, then `npm run db:generate -- --name entry_processed_and_item_origin`; append the view SQL; migration integration test (scenario 15).
3. Feedback eligibility and exclusion predicate, repo and controller changes with unit then integration tests (scenarios 9 to 14).
4. Processed repo, controller, route table, router test, api-server wiring (scenarios 1 to 6, 16).
5. Pending-review payload fields and count pin (scenarios 7, 8).
6. Docs.
`/todo-ie --sync` once per step, same order.

### Scope boundary
- Regeneration skips pending manual items (origin manual) when superseding.
- Web Processed section, Reopen button, hiding grade controls for manual items, API client functions: later todo items.
- Entry list endpoint, entry and item renames, source container: later items.
- No `added` scenarios.
