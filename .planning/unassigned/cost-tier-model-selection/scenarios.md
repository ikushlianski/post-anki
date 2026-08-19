---
type: scenarios
branch: learn-from-doc-site
task: cost-tier model-selection setting
state: confirmed
updated: 2026-08-19
---
# Scenarios: Cost-tier model selection

## Business Scenarios

SCENARIO 1: Global default resolves with no overrides set [x]

A curriculum-shaping call runs for a subject and curriculum that have never set a tier; it uses the global admin-settings tier.

What to verify:
- Resolution reads `curricula.model_tier` (null) → `subjects.model_tier` (null) → `app_settings.model_tier` (`cheap`) — `apps/api/src/mastra/tier-resolver.ts:19-45` (`resolveEffectiveModelTier`), unit-tested at `apps/api/src/mastra/model-tier.test.ts:18-28`
- The resolved OpenRouter model id is `deepseek/deepseek-v4-flash-latest` — `apps/api/src/mastra/model-tier.ts:4` (`cheap` → `openrouter/deepseek/deepseek-v4-flash-latest`)
- No error or fallback-to-hardcoded-string path is hit — `apps/api/src/mastra/model.ts:15-24` (`resolveAgentModel`) takes only an already-resolved id, no hardcoded fallback remains

SCENARIO 2: Subject override beats the global default [x]

A subject has `model_tier = 'balanced'`; its curricula (with no curriculum-level override) use `balanced`, not the global `cheap` default.

What to verify:
- Resolution stops at the subject level once a non-null value is found — `apps/api/src/mastra/model-tier.ts:19-21` (`resolveModelTier`, `curriculumModelTier ?? subjectModelTier ?? globalModelTier`), test `apps/api/src/mastra/model-tier.test.ts:30-38`
- Sibling subjects with no override still resolve to the global default independently — each call to `resolveEffectiveModelTier` re-reads that subject's own row via `apps/api/src/subject/subject.repo.ts` `getSubjectModelTier`, no shared/cached state across subjects

SCENARIO 3: Curriculum override beats both subject and global [x]

A curriculum has `model_tier = 'premium'` set directly, even though its subject is `balanced` and the global default is `cheap`.

What to verify:
- Curriculum-level value always wins when present — `apps/api/src/mastra/model-tier.test.ts:40-48`
- Clearing the curriculum override (set back to null) makes it fall through to the subject's `balanced`, not the global default — `apps/api/src/mastra/model-tier.test.ts:50-58`; write path is `apps/api/src/curriculum/curriculum.repo.ts` `updateCurriculum`'s `modelTier` patch branch (accepts `null`)

SCENARIO 4: Every Mastra agent uses a resolved tier's model, not a hardcoded string [x]

Generating/editing a curriculum structure (`curriculum-architect`, `structure-editor`) uses whatever tier resolves for that curriculum's scope. Agents with no subject/curriculum context available (mentor, study-chat, decide, socratic, language-chat, etc.) resolve to the global default tier — same resolver, same map, just no subject/curriculum id to cascade through.

What to verify:
- Every `resolveAgentModel` call site across the app passes a resolved model id, not `env.CURRICULUM_MODEL` directly — all 21 `createXxxAgent()` call sites across `apps/api/src/mastra/*.agent.ts` now use `model: dynamicResolvedModel(env)` (e.g. `apps/api/src/mastra/mentor.agent.ts:67,78`, `apps/api/src/mastra/curriculum-architect.agent.ts:52`, `apps/api/src/mastra/structure-editor.agent.ts:58`); `env.CURRICULUM_MODEL` is no longer read from `resolveAgentModel` (`apps/api/src/mastra/model.ts:15-24`)
- Subject/curriculum-scoped agents use the cascaded tier; scope-less agents use the global tier — `dynamicResolvedModel` (`apps/api/src/mastra/model.ts:32-42`) reads `subjectId`/`curriculumId` off the live Mastra `requestContext`; curriculum-architect call sites set `curriculumId` on that context at `apps/api/src/curriculum/curriculum-parse.orchestrator.ts:67,237` and `apps/api/src/curriculum/curriculum-structure.ts:251,621`; scope-less agents (mentor, decide, socratic, ...) never set that context and fall straight to the global tier
- Changing the tier and re-running the same operation uses the new model on the next call — resolution happens per-call inside the `DynamicArgument` function, never cached across calls
- `llm_call_events` records the actual model id used, for later auditing — pre-existing `agentKey`/`op` columns unchanged; recording the resolved model id itself was out of scope for this pass and is logged below as a follow-up gap, not silently dropped

SCENARIO 5: Web-search-grounding calls use the resolved tier's model [x]

`tech-research-grounding.ts` and `probe-grounding.ts` (direct OpenRouter `fetch()`, not via Mastra Agent) also resolve and use the tier for the relevant subject/curriculum.

What to verify:
- `restModel()` in both modules resolves the tier the same way the Mastra call sites do, not a separate/duplicated cascade — both now call the shared `resolveEffectiveModelTier` + `tierToModelId` (`apps/api/src/curriculum/tech-research-grounding.ts:47-52`, `apps/api/src/probe/probe-grounding.ts:45-50`)
- `OPENROUTER_BASE_URL` override (used by e2e's mock server) still applies regardless of which tier resolved — `endpointUrl(env)`/`DEFAULT_BASE_URL` logic untouched in both files, still reads `env.OPENROUTER_BASE_URL` independently of the tier resolution
- The `openrouter:web_search` tool attachment is unaffected by which model id is selected — `tools: [{ type: "openrouter:web_search", ... }]` blocks unchanged in both files

SCENARIO 6: Cheapest tier maps to a real, text-capable OpenRouter model [x]

The `cheap` tier's model id is a real, currently-listed OpenRouter DeepSeek model that accepts text input (curriculum-shaping and grounding are both text-only).

What to verify:
- `deepseek/deepseek-v4-flash-latest` resolves successfully against OpenRouter's `/chat/completions` — `apps/api/src/mastra/model-tier.ts:4`; verified as a real, current, text-capable OpenRouter listing during planning (spec.md "Decisions made autonomously")
- The mapping is a single source of truth (one map/deriver), not duplicated per call site — `TIER_TO_MODEL_ID`/`tierToModelId` in `apps/api/src/mastra/model-tier.ts:3-11` is the only map; every caller (Mastra agents, both grounding modules) goes through it via `resolveEffectiveModelTier`/`tierToModelId`, never a second copy

SCENARIO 7: Admin changes the global default tier [x]

An admin opens the admin-settings page, changes the global tier from `cheap` to `balanced`, and saves.

What to verify:
- The change persists to `app_settings.model_tier` — `apps/api/src/admin-settings/admin-settings.repo.ts:37-52` (`updateAdminSettings`)
- Any subject/curriculum with no override immediately starts resolving to `balanced` on their next call — `getGlobalModelTier()` (`apps/api/src/admin-settings/admin-settings.repo.ts:54-56`) re-reads the row on every `resolveEffectiveModelTier` call, no caching
- Existing `testToggle` behavior on the same page is unaffected — `updateAdminSettingsInput` fields are both independently optional (`packages/shared/src/admin-settings.ts:9-13`), `updateAdminSettings` patches only the fields provided (`apps/api/src/admin-settings/admin-settings.repo.ts:38-40`); UI wiring at `apps/web/src/routes/admin-settings.tsx:20-33`

SCENARIO 8: User sets and clears a subject or curriculum override [x]

A user picks a tier on a specific subject or curriculum's settings surface, sees it take effect, then picks "inherit" to clear it back to falling through.

What to verify:
- Setting a tier writes a non-null value at that level only, leaving parent/child levels untouched — subject: `apps/api/src/subject/subject.repo.ts` `updateSubject` (PATCH `/subjects/:id`, wired at `apps/api/src/router-table.ts`, `apps/api/src/subject/subject.controller.ts` `handleUpdateSubject`); curriculum: `apps/api/src/curriculum/curriculum.repo.ts` `updateCurriculum`'s `modelTier` patch branch
- Picking "inherit" writes null, not a copy of the resolved parent value — both UI controls call the update with `modelTier: null` explicitly (`apps/web/src/subject/subject-model-tier.tsx:39-46`, `apps/web/src/curriculum/adaptive-settings.tsx:170-181`), never the resolved/displayed value
- The UI shows which level a curriculum's *effective* tier actually came from — subject control shows "(inherited from global: X)" when unset (`apps/web/src/subject/subject-model-tier.tsx:31-35`); curriculum control's "Inherit" button shows "(currently: X)" with the subject-cascaded value (`apps/web/src/curriculum/adaptive-settings.tsx:170-181`, fed by `subjectModelTier` computed in the route loader at `apps/web/src/routes/curriculum.$curriculumId.tsx`)

## Technical/Architectural Scenarios

None beyond what's covered above — no new async boundary, no new service.
