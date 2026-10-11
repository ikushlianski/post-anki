# Model switcher: implementation report

## What changed

- Allowlist is now eleven models: the ten from `.planning/model-research/report.md` plus `google/gemini-2.5-flash-lite` (retires 2026-10-20). Default stays `anthropic/claude-haiku-5.5`. New shared helpers: `formatKnowledgeItemModelPrice` ("$0.10 in / $0.50 out per 1M") and `resolveUsableKnowledgeItemModelId` (unknown or retired id gives null).
- Reusable web component `ExtractionModelSelect` (`apps/web/src/knowledge-bit/extraction-model-select.tsx`): a plain accessible select, each option reads `Label — price`, retirement date when set, the model note under the field. Used in:
  - admin settings (replaces the radio list; the wrapper `KnowledgeItemModelSelect` keeps its props),
  - Add knowledge (new "Model" row, empty choice means the admin default),
  - the Regenerate confirm step (prices shown at once; empty choice "Same model as before").
- Per-source model: `knowledge_sources.extraction_model_id` (nullable text). Create-source routes accept an optional `modelId` on the text, batch and URL bodies, validated with the shared enum (unknown id: 400). The web client and server functions carry it through.
- Pipeline: `generateItemsForSource` uses the run's explicit model (regenerate), else the source's stored model, else the admin default. An unknown or retired id is never sent to OpenRouter: it logs `knowledge_item_model_unusable_fallback_default` and uses the default. `PendingKnowledgeSource` now carries `extractionModelId` (both claim paths).
- Docs: `docs/architecture/knowledge-bit/extraction-model-switcher.md` updated.

## Migration

`apps/api/src/db/migrations/0091_extraction-model-id.sql`: `ALTER TABLE "knowledge_sources" ADD COLUMN "extraction_model_id" text;` (generated with drizzle-kit, plus `meta/0091_snapshot.json` and the journal entry). Not applied to any database. The local Docker DB on 5562 needs `npm run db:migrate:api` after a backup.

## Verification (real output)

- `npx tsc --noEmit`: apps/api exit 0, apps/web exit 0, packages/shared exit 0, packages/core exit 0, no output lines.
- `npx vitest run` apps/api: Test Files 151 passed, Tests 1410 passed.
- `npx vitest run` packages/shared: Test Files 7 passed, Tests 38 passed.
- `npx vitest run` apps/web: Test Files 161 passed, Tests 998 passed.
- API integration tests (need a Postgres lane) were not run. Their fixtures were updated for the new field (`extractionModelId: null`).

## Tests added or changed

- Shared: price formatting, `resolveKnowledgeItemModelId` fallback, eleven ids.
- API: controller accepts and stores `modelId` for text, batch and URL, 400 on an unknown id, null stays null; repo stores the model; orchestrator uses the source model, lets a regenerate model win, falls back for an unknown id and for a retired id (clock set to 2026-10-21); admin settings fallback list updated to removed ids.
- Web: `ExtractionModelSelect`, admin select, the Add knowledge form sends `modelId` (single, batch, default left empty), Regenerate shows prices as soon as it opens.

## Open

- Not clicked through in a browser.
- The default model is still undecided (Haiku today, GPT-6 Luna suggested by the research report).
- A regenerate run does not write its model back to the source.
- The question, fill-blank and basic card generators run after extraction and read the admin default, not the source's own model.
- `google/gemini-2.5-flash-lite` must be removed from the list after 2026-10-20.
- Local Docker DB needs the 0091 migration applied (backup first).

END-OF-REPORT
