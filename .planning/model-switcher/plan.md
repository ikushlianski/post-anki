# Plan: pick the knowledge-item model from five candidates

## Goal
An admin picks one of five OpenRouter models on the admin settings page, and the knowledge-item detector and the question, fill-blank and basic card writers use it from the next run on, with each call's model recorded.

## Approach
- Fact: `app_settings` (apps/api/src/db/schema.ts:547) already stores the global `modelTier`, read by `getGlobalModelTier()`. We add one sibling column, not a new table.
- Fact: the four agents freeze `tierToModelId("cheap")` in a module-level const. Each agent's `model` becomes a dynamic function, the same mechanism `dynamicResolvedModel` (apps/api/src/mastra/model.ts:32) already uses. No restart is needed.
- Pinning: each run reads the setting once, passes it to the agent through requestContext, and passes the same id to `generateWithRetry` for logging. A run and its retries share one model, and the log matches what ran. A change applies to the next run; a run in flight keeps its model.
- Scope: global only. The subject/curriculum tier cascade is not applied to these four agents, which ignore tiers today. The other knowledge-bit agents (followup, tagger, placer, grader) and probe stay on the cheap tier.
- The allowlist lives in packages/shared as a Zod enum plus display metadata. The API rejects other ids through the existing 400 `invalid_input` path. A stored value outside the list falls back to the default and logs a warning.
- Logging: a nullable `model_id` column on `llm_call_events`, the existing per-call table.
- Fact: `npm run models:prices` only prints to stdout (scripts/openrouter-models.ts) and writes no file. The price constant is refreshed by hand, and its date is bumped.
- Fact (OpenRouter models API, fetched 2026-10-11; USD per 1M input / output tokens; all five report structured_outputs support):
  - deepseek/deepseek-v4-flash: 0.03 / 1.28 (default)
  - openai/gpt-oss-20b: 0.018 / 0.09
  - openai/gpt-4o-mini: 0.15 / 0.60
  - mistralai/mistral-nemo: 0.029 / 0.03
  - inclusionai/ling-3.0-flash-vl: 0.021 / 0.0616
- Assumption, verify in tests: Mastra passes the `requestContext` given to `generate()` into a dynamic `model` function.

## Steps
1. packages/shared/src/knowledge-item-model.ts (new): ids as a const tuple, `knowledgeItemModelIdSchema` (z.enum), `KNOWLEDGE_ITEM_MODELS` (id with `openrouter/` prefix, label, inputPerMillion, outputPerMillion, note), `KNOWLEDGE_ITEM_MODELS_CHECKED_ON = "2026-10-11"`, `DEFAULT_KNOWLEDGE_ITEM_MODEL_ID`. Export from packages/shared/src/index.ts.
2. packages/shared/src/admin-settings.ts: add `knowledgeItemModelId` to `adminSettingsSchema` (required) and to `updateAdminSettingsInput` (optional).
3. apps/api/src/db/schema.ts: `appSettings.knowledgeItemModelId` = text `knowledge_item_model_id`, NOT NULL, default `"openrouter/deepseek/deepseek-v4-flash"`. `llmCallEvents.modelId` = text `model_id`, nullable.
4. Migration (guarded): run `npm run db:generate:api`. It needs no DB connection. Keep the generated SQL as-is, with only additive ADD COLUMN statements and no DROP or rewrite. Do not run it against any DB in this todo until Done-when step 5 passes.
5. apps/api/src/admin-settings/admin-settings.repo.ts: map the new column in `toAdminSettings`, the default, and `updateAdminSettings`. Add `getKnowledgeItemModelId()`, which parses the stored value with the shared schema and falls back to the default with `log.warn` on an unknown value.
6. apps/api/src/mastra/model.ts: add `dynamicKnowledgeItemModel(env)`. It reads `requestContext.get("knowledgeItemModelId")`, falls back to `getKnowledgeItemModelId()`, and returns `resolveAgentModel(id, env.OPENROUTER_BASE_URL)`.
7. apps/api/src/mastra/generate-with-retry.ts and apps/api/src/llm-call-events/llm-call-events.repo.ts: add an optional `{ modelId }` last argument to `generateWithRetry` and `recordGenerateCall`, pass it to the event record, and write `model_id`. Existing callers are unchanged.
8. The four agent files (knowledge-bit-detector, knowledge-bit-question-generator, knowledge-bit-fill-blank-generator, knowledge-bit-basic-card-generator .agent.ts): delete the module-level `tierToModelId("cheap")` const. Set `model: dynamicKnowledgeItemModel(env)`. Each run function reads the id once, passes it to `agent.generate(prompt, { ..., requestContext })`, and passes `{ modelId }` to `generateWithRetry`.
9. apps/web/src/admin-settings/admin-settings.api.ts: replace the local `updateAdminSettingsInput` copy with the shared schema import.
10. apps/web/src/admin-settings/knowledge-item-model-select.tsx (new): radio group. Each option shows label, "$in / $out per 1M tokens", its note, and "prices checked 2026-10-11". Props mirror `ModelTierSelect`.
11. apps/web/src/routes/admin-settings.tsx: render the select below the model tier row. Add `setKnowledgeItemModel`, which mirrors `setModelTier`.
12. Grep `testToggle:` under apps/api and apps/web. Add `knowledgeItemModelId` to any typed AdminSettings fixture or mock.

## Tests
- packages/shared/src/knowledge-item-model.test.ts: accepts the five ids; rejects `openrouter/deepseek/deepseek-v4-pro`, the `-latest` alias and an empty string; each entry has positive prices and a note.
- apps/api/src/admin-settings/admin-settings.repo.test.ts (new, mocked getDb): default when no row; an unknown stored value falls back to the default; update persists and returns the new id.
- apps/api/src/mastra/model.test.ts: the dynamic model uses the id from requestContext; with no context it reads the stored id.
- The four existing knowledge-bit-*.agent.test.ts files: run passes requestContext with the pinned id and passes `modelId` to `generateWithRetry`.
- apps/api/src/mastra/generate-with-retry.test.ts: `modelId` reaches the event on success and failure; absent `modelId` records null.
- apps/web/src/admin-settings/knowledge-item-model-select.test.tsx (new): five radios with names and prices; a click calls onChange with the chosen id; `disabled` blocks the change.
- Migration: apps/api/src/db/migrations.integration.test.ts, run only against the local DB (assertLocalDbTarget).

## Done when
- A fresh local DB shows the admin page with five radios, deepseek checked.
- Selecting gpt-oss-20b, then running card generation, writes `model_id = openrouter/openai/gpt-oss-20b` on the next `llm_call_events` rows for the four agents, with no restart.
- A PATCH with an id outside the five returns 400 `invalid_input` and leaves the stored value unchanged.
- The migration ran only against 127.0.0.1:5562/postanki_dev. `DATABASE_URL` was set explicitly, so the Neon URL in apps/api/.env was not used. A `pg_dump -Fc` backup was taken first, to a path outside the repo.
- Neon is untouched. Do not merge until the user approves the production migration, because CI's deploy-time migrate runs against production.
- `npx tsc --noEmit` and project lint are clean. `npx vitest run` passes on the touched files.
- The price constant matches `npm run models:prices` output for the five ids on the day of implementation. The date is bumped if any value changes.

## Defaults chosen
- Stored id keeps the `openrouter/` prefix, matching TIER_TO_MODEL_ID and resolveAgentModel input; no translation layer.
- Default is deepseek-v4-flash, the current cheap tier; today's behavior is unchanged.
- Storage is a column on app_settings, not a new table; it follows the single-row settings pattern.
- Column is NOT NULL with a default, mirroring model_tier.
- Global only, no subject/curriculum cascade; the four agents ignore tiers today, and a comparison needs one controlled variable.
- In scope: detector, question, fill-blank, basic only; the brief lists these, and the rest stay on cheap.
- Model pinned per run, retries included; the logged model matches what ran.
- Logged in llm_call_events.model_id, nullable; it is the existing per-call table and is queryable for comparison.
- Prices are a static shared constant with a checked-on date; no runtime fetch, no new dependency.
- Notes are short, from the measured results. mistral-nemo and ling read "not yet tested".
- The existing tier select stays; other agents still use it.
- DB target is this repo's compose Postgres. Flag: the top-level CLAUDE.md says personal projects use the shared pet-projects container, so this repo's own compose conflicts with it. Not changed here.
- No brief.md exists for this todo; the only brief is .planning/classic-anki-review/brief.md, which is a different todo. Existing mastra and admin-settings patterns serve as the architecture.

## Footprint
- New: packages/shared/src/knowledge-item-model.ts and its test; apps/api/src/admin-settings/admin-settings.repo.test.ts; apps/api/src/mastra/model.test.ts; apps/web/src/admin-settings/knowledge-item-model-select.tsx and its test; migration SQL, snapshot and journal entry under apps/api/src/db/migrations/.
- Modified: packages/shared/src/admin-settings.ts and index.ts; apps/api/src/db/schema.ts; admin-settings.repo.ts; mastra/model.ts; generate-with-retry.ts and its test; llm-call-events.repo.ts; the four knowledge-bit agent files and their tests; apps/web/src/admin-settings/admin-settings.api.ts; apps/web/src/routes/admin-settings.tsx.
- Database: two additive columns (app_settings.knowledge_item_model_id, llm_call_events.model_id), local only in this todo.
- Not touched: router, controller, env, CI config, Neon, followup/tagger/placer/grader/probe agents, subject and curriculum tier logic. No new dependencies.

END-OF-REPORT
