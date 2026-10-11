---
type: architecture
domain: knowledge-bit
component: extraction-model-switcher
state: as-built
updated: 2026-10-11
---
# Knowledge-item model switcher

## What it does

Eleven OpenRouter models are on a fixed allowlist (ten recommended ones and Gemini 2.5 Flash Lite, which stays until OpenRouter retires it). Each option shows its price per 1M input and output tokens, like the OpenRouter catalogue. The model is chosen in three places:

- **Admin settings.** The global default. The four knowledge-item writers (the whole-source item writer, and the question, fill-blank and basic card generators) use it from their next run onward. A run that has already started keeps the model it read at its start.
- **Add knowledge.** An optional model for the pasted text, links or batch. It is stored on each created source and used for that source's extraction. Leaving it on the default entry stores nothing, so the admin default applies.
- **Regenerate** on the approval page. The model list with prices opens the moment the button is pressed. The chosen model pins that run only. "Same model as before" keeps the source's own model, or the admin default when it has none.

Every LLM call those writers make records the model id it used. The choice does not follow the subject or curriculum tier cascade that other agents use.

## The allowlist

`packages/shared/src/knowledge-item-model.ts` is the single source of truth. It defines:

- `KNOWLEDGE_ITEM_MODEL_IDS`, a fixed tuple of eleven ids, and a Zod enum built from it. The API rejects any other id with 400 `invalid_input`: the admin settings route, the create-source route (`modelId` on text, batch and URL bodies) and the regenerate route all use the same enum. The order is the order the select shows.
- `DEFAULT_KNOWLEDGE_ITEM_MODEL_ID`: `openrouter/anthropic/claude-haiku-5.5`. It is the fallback for a missing or unknown stored value and the model written when the settings row is first created. The user has not chosen a final default, so GPT-6 Luna is a candidate (see `.planning/model-research/report.md`).
- Display metadata per model: label, input and output price per million tokens, an optional `expiresOn` date from OpenRouter, and a note. `KNOWLEDGE_ITEM_MODEL_OPTIONS` is the ordered list the UI renders.
- `formatKnowledgeItemModelPrice`, which renders `$0.10 in / $0.50 out per 1M`, and `resolveUsableKnowledgeItemModelId`, which returns an id only when it is on the list and not past its `expiresOn` date.
- `KNOWLEDGE_ITEM_MODELS_CHECKED_ON`, a date constant (`2026-10-11`) for when the prices and expiry dates were read from OpenRouter.

Values on 2026-10-11 (USD per 1M input / output tokens):

| Model | Input | Output | Expires on OpenRouter |
|---|---|---|---|
| openai/gpt-6-luna | 0.10 | 0.50 | none |
| anthropic/claude-haiku-5.5 | 0.10 | 0.50 | none |
| google/gemma-4-31b-it | 0.09 | 0.34 | none |
| openai/gpt-oss-120b | 0.037 | 0.17 | none |
| mistralai/mistral-small-3.2-24b-instruct | 0.094 | 0.25 | none |
| meta-llama/llama-3.3-70b-instruct | 0.22 | 0.50 | none |
| openai/gpt-5-mini | 0.25 | 2.00 | none |
| google/gemini-3.1-flash-lite | 0.25 | 1.50 | none |
| openai/gpt-4o-mini | 0.15 | 0.60 | none |
| openai/gpt-4.1-nano | 0.10 | 0.40 | none |
| google/gemini-2.5-flash-lite | 0.10 | 0.40 | 2026-10-20 |

The prices and expiry dates are hand-entered constants. Nothing in the running system fetches them.

## Storage

- `app_settings.knowledge_item_model_id` is a non-null text column. It sits next to the global `model_tier` column in `apps/api/src/db/schema.ts`. Migration: `apps/api/src/db/migrations/0090_clear_korvac.sql`, which set the column default to `openrouter/deepseek/deepseek-v4-flash` and is not changed. The repo does not rely on that default: it writes the shared constant when it creates the row.
- `getAdminSettings()` in `apps/api/src/admin-settings/admin-settings.repo.ts` reads the row. If the row is missing, it inserts the default row and returns the default. If the stored value is not on the allowlist, it logs `knowledge_item_model_id_unknown_fallback_default` and returns the default, so a bad value cannot break a run. The fallback is read-only: the stored value is left as it is until an admin saves a new model.
- `knowledge_sources.extraction_model_id` is a nullable text column (migration `apps/api/src/db/migrations/0091_extraction-model-id.sql`). It holds the model chosen when the source was pasted. Null means "use the admin default".
- `llm_call_events.model_id` is a nullable text column (same migration). It is filled only for calls that pin a model, which in practice means the four writers. Every other agent writes null.

## How the model is chosen for a source

`generateItemsForSource` in `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts` takes the run's explicit model (regenerate) first and the source's stored `extraction_model_id` second. The result goes through `resolveUsableKnowledgeItemModelId`. An id that is unknown or past its retirement date is never sent to OpenRouter: the run logs `knowledge_item_model_unusable_fallback_default` and uses the admin default. The question, fill-blank and basic card generators that run later for each suggestion read the admin default.

## How the four writers read the model

Each writer's run follows the same steps:

1. The run uses the model it was given, or calls `getKnowledgeItemModelId()` once.
2. It builds a Mastra `RequestContext` holding `knowledgeItemModelId`.
3. It calls `generateWithRetry`, passing the same id in options so the logged row names what ran.

The agent's `model` field is `dynamicKnowledgeItemModel(env)` from `apps/api/src/mastra/model.ts`. Mastra calls it per generate call. It returns the pinned id from the request context when present, and otherwise reads the stored setting. It then passes the id through `resolveAgentModel`, which adds the OpenRouter base URL.

The four writers are `knowledge-bit-source-items.agent.ts` (it replaced the sentence-by-sentence detector and writes statement, question and answer from the whole source), `knowledge-bit-question-generator.agent.ts`, `knowledge-bit-fill-blank-generator.agent.ts` and `knowledge-bit-basic-card-generator.agent.ts`, all under `apps/api/src/mastra/`.

`generateWithRetry` in `apps/api/src/mastra/generate-with-retry.ts` retries a failed call twice (three attempts). It writes one `llm_call_events` row for the whole retry sequence, either on success with token counts or on final failure with the error message. The row carries the pinned `modelId`.

The other knowledge-bit agents (followup, answer grader, placer, tagger) pass a fixed model from `resolveAgentModel` and do not read this setting.

## Admin settings select

- The UI is `apps/web/src/admin-settings/knowledge-item-model-select.tsx`. It wraps the shared `ExtractionModelSelect` (`apps/web/src/knowledge-bit/extraction-model-select.tsx`), a plain accessible select where each option reads `Label — $in in / $out out per 1M`, with a retirement date for a model that is going away and the model's note under the field. The same component is used on the Add knowledge form and in the Regenerate confirmation.
- The page is `apps/web/src/routes/admin-settings.tsx`. A change calls `updateAdminSettings`, which sends `PATCH /admin/settings` (declared in `apps/api/src/router-table.ts`).

## Price check script

`npm run models:prices` (root `package.json`) runs `scripts/openrouter-models.ts`. It fetches the public OpenRouter model list with a 15-second timeout and prints a table. The table marks the model the app's cheap tier currently uses. Flags: `--structured` (the default) or `--no-structured`, `--sort` with a sort key, and `--limit` (default 20). The script is read-only: it writes no file and does not change the allowlist. Updating a price or adding a model means editing `knowledge-item-model.ts` by hand.

## Known limits

- Not verified in a browser. The select and the save path are read from code and tests, not clicked through.
- The quality notes come from two benchmarks: `.planning/source-first-generation/model-benchmark.md` and the later runs in `.planning/model-research/report.md` (a Russian text, 4 to 5 runs per model, and an English text, 3 runs). The repo holds no automated quality check for any model.
- `google/gemini-2.5-flash-lite` expires on 2026-10-20 on OpenRouter. It stays on the list with a visible note and is not the default. After that date a source that stored it falls back to the admin default. Remove it from the list by then.
- A stored value of `openrouter/deepseek/deepseek-v4-flash`, `openrouter/google/gemma-3-12b-it`, `openrouter/mistralai/mistral-small-24b-instruct-2501` (or any other removed id) stays in the database until an admin picks a model. Reads use the new default in the meantime.
- Prices are a dated snapshot. The date constant does not trigger any check when prices go stale.
- Two places hold a default and they now differ: the TypeScript constant (`claude-haiku-5.5`) and the column default in migration 0090 and `schema.ts` (`deepseek-v4-flash`). The column default only applies when a row is inserted without this field, which the repo never does.
- A regenerate run does not overwrite the source's stored model. Only the run uses it.
- The model applies to the four writers only. The per-subject and per-curriculum tier cascade does not reach them.

## Plan

`.planning/model-switcher/plan.md` records the design: a sibling column rather than a new table, dynamic model functions instead of module-level constants, and per-run pinning.
