---
type: architecture
domain: knowledge-bit
component: extraction-model-switcher
state: as-built
updated: 2026-10-11
---
# Knowledge-item model switcher

## What it does

An admin picks one of five OpenRouter models on the admin settings page. The four knowledge-item writers (the detector, and the question, fill-blank and basic card generators) use that model from their next run onward. A run that has already started keeps the model it read at its start. Every LLM call those writers make records the model id it used.

The choice is global. It does not follow the subject or curriculum tier cascade that other agents use.

## The allowlist

`packages/shared/src/knowledge-item-model.ts` is the single source of truth. It defines:

- `KNOWLEDGE_ITEM_MODEL_IDS`, a fixed tuple of five ids, and a Zod enum built from it. The API rejects any other id with 400 `invalid_input`, through the existing admin settings validation.
- `DEFAULT_KNOWLEDGE_ITEM_MODEL_ID`: `openrouter/deepseek/deepseek-v4-flash`.
- Display metadata per model: label, input and output price per million tokens, and a note. `KNOWLEDGE_ITEM_MODEL_OPTIONS` is the ordered list the UI renders.
- `KNOWLEDGE_ITEM_MODELS_CHECKED_ON`, a date constant (`2026-10-11`) for when the prices were typed in.

The prices are hand-entered constants. Nothing in the running system fetches them.

## Storage

- `app_settings.knowledge_item_model_id` is a non-null text column with the default above. It sits next to the global `model_tier` column in `apps/api/src/db/schema.ts`. Migration: `apps/api/src/db/migrations/0090_clear_korvac.sql`.
- `getAdminSettings()` in `apps/api/src/admin-settings/admin-settings.repo.ts` reads the row. If the row is missing, it inserts the default row and returns the default. If the stored value is not on the allowlist, it logs `knowledge_item_model_id_unknown_fallback_default` and returns the default, so a bad value cannot break a run.
- `llm_call_events.model_id` is a nullable text column (same migration). It is filled only for calls that pin a model, which in practice means the four writers. Every other agent writes null.

## How the four writers read the model

Each writer's run follows the same steps:

1. The run calls `getKnowledgeItemModelId()` once.
2. It builds a Mastra `RequestContext` holding `knowledgeItemModelId`.
3. It calls `generateWithRetry`, passing the same id in options so the logged row names what ran.

The agent's `model` field is `dynamicKnowledgeItemModel(env)` from `apps/api/src/mastra/model.ts`. Mastra calls it per generate call. It returns the pinned id from the request context when present, and otherwise reads the stored setting. It then passes the id through `resolveAgentModel`, which adds the OpenRouter base URL.

The four writers are `knowledge-bit-detector.agent.ts`, `knowledge-bit-question-generator.agent.ts`, `knowledge-bit-fill-blank-generator.agent.ts` and `knowledge-bit-basic-card-generator.agent.ts`, all under `apps/api/src/mastra/`.

`generateWithRetry` in `apps/api/src/mastra/generate-with-retry.ts` retries a failed call twice (three attempts). It writes one `llm_call_events` row for the whole retry sequence, either on success with token counts or on final failure with the error message. The row carries the pinned `modelId`.

The other knowledge-bit agents (followup, answer grader, placer, tagger) pass a fixed model from `resolveAgentModel` and do not read this setting.

## Admin settings select

- The UI is `apps/web/src/admin-settings/knowledge-item-model-select.tsx`. It renders one radio option per entry in `KNOWLEDGE_ITEM_MODEL_OPTIONS`, with the label, prices and note.
- The page is `apps/web/src/routes/admin-settings.tsx`. A change calls `updateAdminSettings`, which sends `PATCH /admin/settings` (declared in `apps/api/src/router-table.ts`).

## Price check script

`npm run models:prices` (root `package.json`) runs `scripts/openrouter-models.ts`. It fetches the public OpenRouter model list with a 15-second timeout and prints a table. The table marks the model the app's cheap tier currently uses. Flags: `--structured` (the default) or `--no-structured`, `--sort` with a sort key, and `--limit` (default 20). The script is read-only: it writes no file and does not change the allowlist. Updating a price or adding a model means editing `knowledge-item-model.ts` by hand.

## Known limits

- Not verified in a browser. The select and the save path are read from code and tests, not clicked through.
- The two models marked "Not yet tested" in the allowlist (`mistral-nemo`, `ling-3.0-flash-vl`) have no quality check in the repo. Structured output from them is unverified.
- Prices are a dated snapshot. The date constant does not trigger any check when prices go stale.
- Two places hold the default: the TypeScript constant and the column default in migration 0090. They must agree, and nothing in the code compares them.
- The model applies to the four writers only. The per-subject and per-curriculum tier cascade does not reach them.

## Plan

`.planning/model-switcher/plan.md` records the design: a sibling column rather than a new table, dynamic model functions instead of module-level constants, and per-run pinning.
