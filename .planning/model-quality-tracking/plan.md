# Card quality by model

## Goal
- Every model-written card records the model that wrote it.
- Every rating and triage decision is tied to that model, not to today's admin setting.
- One table shows, per model: approved / rejected / chat / pending / superseded counts, approval rate, average rating.

## Facts (checked against code, 2026-11-11)
- `knowledge_sources.extraction_model_id` is a per-source override (`apps/api/src/knowledge-source/knowledge-source.repo.ts:109`); null on all 434 prod sources, so it never says which model ran.
- Every extraction insert goes through one function: `insertSourceItemsForChunk` (`apps/api/src/knowledge-bit/knowledge-bit-source-items.repo.ts:70`, bit rows built at :118, insert at :134). Callers: inline `processChunk` (`detect-knowledge-bits-chunk.ts:233`), durable `chunkInsertStep` (`extraction-inngest.steps.ts:54`), durable `finishStep` (`durable-extraction.steps.ts:251`). `insertKnowledgeBits` in `knowledge-bit-write.repo.ts` has no non-test callers; ignore it.
- Every model call (inline, durable, each fusion member) goes through `writeAndValidateOne` (`detect-knowledge-bits-chunk.ts:110`) then `writeOnce` (:45) then `deps.writeItems`. The default model is resolved late and privately inside each writer (`options.modelId ?? getKnowledgeItemModelId()`, e.g. `mastra/knowledge-bit-source-items.agent.ts:263`), so it is not visible to the insert today.
- Fusion has no "winner": `groupFusionCards` (`knowledge-bit-fusion-extraction.ts:35`) merges same-statement lessons and keeps the first model's text; all producers go to `lesson.modelIds` and `knowledge_bit_fusion_models`.
- Rating-time model: bit feedback uses the private `resolveModelId` at `knowledge-bit-feedback.repo.ts:32` (used at :107), and `upsertKnowledgeBitGrades` (`knowledge-bit-model-evidence.repo.ts:136`) inserts a feedback row with no `modelId` at all. `resolveFeedbackModelId` (`knowledge-bit-feedback.model-id.ts`) is only used by the per-source grade (`knowledge-source-extraction-grade.repo.ts:30`); it has no bit, so it stays unchanged.
- Triage decisions: `insertDecisionRow` sets `extractionModelId: context?.extractionModelId ?? fallbackModelId` (`card-triage-decision.repo.ts:128`); context comes from `loadDecisionContext` (`card-triage-decision-context.repo.ts:34`, source override at :85); fallback is the latest feedback row's model (`card-triage-decision.repo.ts:228`, `card-triage-decision-count.repo.ts:146`).
- `llm_call_events` (`db/schema.ts:999`) has no source link: extraction calls pass `curriculumId` null and no `knowledgeBitId`. It cannot be used for backfill.
- Existing per-model views group by `knowledge_bit_feedback.model_id` (admin observability `GET /admin/knowledge-bit-feedback/by-model`, and stats `triageByModel`). They become correct once feedback takes the card's stamp; they are not replaced.
- Triage history page: `apps/web/src/card-triage/triage-history-page.tsx` (route `/knowledge/triage-history`), already shows `extractionModelId` per row (`triage-history-item.tsx:43`).

## Approach
- New nullable `knowledge_bits.generated_by_model_id`, stamped at insert from the model actually called, carried on the in-memory lesson (`LessonDraft.generatedByModelId`).
- Stamp in `writeAndValidateOne` (the single choke point): resolve `options.modelId ?? default`, pass the resolved id down as `options.modelId` so stamp equals the model called, then tag valid and flagged lessons. Fusion members already pass their own `modelId`; grouping keeps the stored text's model.
- Feedback and decision rows read the card's stamp first; fall back to today's behaviour only when null.
- No new module boundary beyond one read endpoint plus one table on the history page.

## Steps
1. Schema: add `generatedByModelId: text("generated_by_model_id")` to `knowledgeBits` in `apps/api/src/db/schema.ts`; generate the Drizzle migration (next number after 0158) and apply via `apps/api/scripts/migrate.ts`.
2. Types: add `generatedByModelId?: string` to `LessonDraft` (`knowledge-bit-source-item-validation.ts:36`); add optional `loadDefaultModelId?: () => Promise<string>` to `GenerateItemsDeps` (`detect-knowledge-bits.types.ts`), wired to `getKnowledgeItemModelId` in `defaultGenerateItemsDeps` (`detect-knowledge-bits.orchestrator.ts:59`).
3. Stamp: in `writeAndValidateOne` resolve the model (`options.modelId ?? await deps.loadDefaultModelId?.()`), call `writeAndValidateWith` with it as `modelId`, then map `valid` and `flagged[].lesson` to include `generatedByModelId`. If no id resolves, leave unstamped. Files: `detect-knowledge-bits-chunk.ts`.
4. Insert: in `insertSourceItemsForChunk` add `generatedByModelId: item.generatedByModelId ?? null` to each bit row (`knowledge-bit-source-items.repo.ts:118`). Inline and durable paths both use it, so no other insert edits.
5. Feedback: in `recordKnowledgeBitFeedback` select `knowledgeBits.generatedByModelId` (:55) and use `bit.generatedByModelId ?? await resolveModelId(...)` (:107). In `upsertKnowledgeBitGrades` select the stamp and set `modelId` on the inserted row (`knowledge-bit-model-evidence.repo.ts:111,136`).
6. Decisions: in `loadDecisionContext` select the bit's stamp and set `extractionModelId: bit.generatedByModelId ?? source?.extractionModelId ?? null`. This covers client and reconciled decisions; `fallbackModelId` stays as last resort.
7. Backfill script `apps/api/scripts/backfill-card-models.ts` plus logic/repo in `apps/api/src/knowledge-bit/card-model-backfill.ts` and `.repo.ts` (pattern: `backfill-phrase-sentences.ts`, `parsePhraseBackfillArgs`, `assertReextractTarget`; dry run default, `--apply`, `--allow-remote`). Fills only null stamps from reliable sources: bits with exactly one `knowledge_bit_fusion_models` row, and bits whose source has `extraction_model_id`. Also copies the stamp into null `card_triage_decisions.extraction_model_id` and null `knowledge_bit_feedback.model_id`. Dry run also prints how many bits could be filled from existing feedback `model_id` (inferred from the setting at rating time); applied only with `--from-feedback`.
8. Shared: Zod response `cardQualityByModelResponse` in `packages/shared/src` (new file `card-quality.ts`, exported from the package index).
9. API: `GET /card-quality/models?days=` (optional, filters by `knowledge_bits.created_at`). Register name in `apps/api/src/router.ts`, entry in `router-table.ts` (copy the `getKnowledgeBitFeedbackByModel` entry at :251), case in `api-server.ts`. Files: `apps/api/src/card-quality/card-quality.controller.ts`, `.orchestrator.ts` (rate math), `.repo.ts`. Repo groups non-manual bits (`origin <> 'manual'`) by stamp (null shown as "unknown") counting by `approval_state`; average rating and top 3 reject reasons come from `knowledge_bit_feedback` joined on bit id. Approval rate = approved / (approved + rejected); null when both are 0.
10. Web: `apps/web/src/card-triage/card-quality.api.ts` (server fn like `triage-history.api.ts`), `use-card-quality.ts`, `model-quality-table.tsx` rendered at the top of `triage-history-page.tsx`. No new route (avoids regenerating `routeTree.gen.ts`). Plain table, no charts.

## Tests
- `detect-knowledge-bits-chunk.test.ts`: single model stamps resolved default; explicit override stamps the override; fusion stamps the stored text's model while `modelIds` keeps all; flagged lessons are stamped.
- `knowledge-bit-source-items.repo.integration.test.ts`: insert persists the stamp; null when absent. `extraction-inngest.steps.test.ts`: durable chunk insert passes it through.
- `knowledge-bit-feedback-origin.test.ts` / `knowledge-bit-feedback.repo.integration.test.ts`: feedback prefers the stamp over the admin setting; rating-only row gets the stamp.
- `card-triage-decision.repo.integration.test.ts`: decision keeps the card's model after the admin setting changes, with and without feedback.
- `card-quality.orchestrator.test.ts`: rate ignores pending/chat/superseded, handles 0/0; repo integration test for counts and the unknown bucket.
- Backfill: pure-function test for source selection; dry run writes nothing.
- `model-quality-table.test.tsx`: renders rows, the unknown bucket, empty state.

## Done when
- A new card from inline and durable extraction, single and fusion, has `generated_by_model_id` set.
- Changing the admin default after extraction does not change the model on later ratings or decisions for that card.
- `GET /card-quality/models` returns the per-model counts, rate, average rating, top 3 reasons; the table shows on the triage history page.
- Backfill script exists, dry run prints counts and changes nothing. The implementer does NOT run `--apply`; only the orchestrator runs it.
- `npx tsc --noEmit`, lint, and the touched test files pass.

## Defaults chosen
- Stamp on the card, not the source: a source can be re-extracted with another model.
- Fusion cards count toward the model whose text was stored (first in `modelIds`): one owner per card keeps counts additive.
- Resolve the default model before the call and pass it down: stamp then equals the model called, even if the setting changes mid-run.
- Feedback-derived backfill is opt-in: that model was the setting at rating time, not proven authorship.
- Fill-null-only backfill: never overwrite existing values.
- Table lives on the history page, no new route: avoids regenerating the route tree.
- Unstamped legacy cards keep today's fallback until backfilled.

## Out of scope
- The model-comparison feature (`model_comparison_*` tables, empty).
- iOS and Mac screens.
- Changing which model is the default.
- Per-source grade (`resolveFeedbackModelId`), replacing the existing admin/stats per-model views, charts.

END-OF-REPORT
