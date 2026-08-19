---
type: spec
branch: learn-from-doc-site
task: cost-tier model-selection setting
complexity: complex
state: confirmed
updated: 2026-08-19
---

# Spec: Cost-tier model selection

### Summary
Introduces a named "model tier" (cheap / balanced / premium) that controls which OpenRouter model curriculum-shaping and web-search-grounding calls use. A global default lives in the existing `app_settings` admin-settings row; a subject can override it; a curriculum (course) can override the subject. Each level falls back to the level above when unset. The global default becomes `cheap`, mapped to `deepseek/deepseek-v4-flash-latest` — the cheapest current DeepSeek model on OpenRouter that's still text-capable.

### Implementation Phases
| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|-------|-----------|------------------|-------------------|--------------|---------------------|
| 1 — Data model + tier resolution | 1, 2, 3, 6 | migration, tier→model map, resolver function, repo/service updates | none | none | n/a |
| 2 — Call-site wiring | 4, 5 | thread subjectId/curriculumId into the 2 grounding modules + curriculum/structure-generation agent call sites | none | Phase 1 | n/a |
| 3 — Settings UI | 7, 8 | none | global picker on admin-settings page, subject/curriculum override picker | Phase 1 | n/a |

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|--------------------|
| `resolveModelTier` | curriculum.modelTier, subject.modelTier, appSettings.modelTier | effective `ModelTier` for a given scope | 1, 2, 3 |
| `tierToModelId` | `ModelTier` | OpenRouter model id string | 1, 6 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| 1. Global default resolves with no overrides | `apps/api/src/admin-settings/*`, `apps/api/src/mastra/model-tier.ts` (new) | None | migration |
| 2. Subject override beats global | `apps/api/src/subjects/*.repo.ts`, `model-tier.ts` | None | migration |
| 3. Curriculum override beats subject and global | `apps/api/src/curriculum/*.repo.ts`, `model-tier.ts` | None | migration |
| 4. Curriculum-shaping call uses resolved tier | `apps/api/src/mastra/curriculum-architect.agent.ts`, `structure-editor.agent.ts`, `model.ts` | None | None |
| 5. Web-search-grounding call uses resolved tier | `apps/api/src/curriculum/tech-research-grounding.ts`, `apps/api/src/probe/probe-grounding.ts` | None | None |
| 6. Cheapest tier maps to a live, text-capable OpenRouter DeepSeek model | `model-tier.ts` | None | None |
| 7. Admin can change the global default | `admin-settings.controller.ts`, `.repo.ts` | `apps/web/src/admin-settings/*`, `routes/admin-settings.tsx` | None |
| 8. User can set/clear a subject or curriculum override | subject/curriculum controllers | subject settings panel, curriculum settings panel | None |

### Files to create
```
apps/api/src/mastra/model-tier.ts   — ModelTier type, tierToModelId map, resolveModelTier(scope)
packages/shared/src/model-tier.ts   — modelTierSchema (zod enum), shared type + display labels
apps/api/src/db/migrations/00XX_add_model_tier.sql — generated via drizzle-kit, not hand-written
```

### Files to modify
```
apps/api/src/db/schema.ts           — add modelTier column to appSettings, subjects, curricula
apps/api/src/admin-settings/admin-settings.repo.ts   — read/write global modelTier
apps/api/src/admin-settings/admin-settings.controller.ts
packages/shared/src/admin-settings.ts — extend schema with modelTier
apps/api/src/mastra/model.ts        — resolveAgentModel takes a resolved model id, not env.CURRICULUM_MODEL directly
apps/api/src/mastra/curriculum-architect.agent.ts, structure-editor.agent.ts — pass resolved tier's model id
apps/api/src/curriculum/tech-research-grounding.ts — restModel() takes subjectId/curriculumId, resolves tier
apps/api/src/probe/probe-grounding.ts — same
apps/web/src/admin-settings/* — tier picker instead of/alongside test toggle
apps/web/src/routes/admin-settings.tsx
subject + curriculum settings surfaces (existing edit panels) — add override picker with "inherit" option
```

### Data model changes
- `app_settings.model_tier text not null default 'cheap'` — global default, always set (no null state at this level).
- `subjects.model_tier text` — nullable, unset means "inherit global." Same nullable-cascade shape as `topics.depth`.
- `curricula.model_tier text` — nullable, unset means "inherit subject, then global." Same shape as `curricula.default_depth`'s sibling columns.
- No new table: this is 3 columns added to existing tables plus one new shared map (tier → OpenRouter model id), following the existing "text column, app-level validated, not a pg enum" convention used throughout `schema.ts`.

### Seed data
Not applicable — every scenario is verifiable by setting the tier at each level via the existing admin-settings/subject/curriculum edit surfaces and observing which model id a triggered curriculum-shaping or grounding call uses (visible via `llm_call_events`, which already records the model per call).

### Documentation changes
No `docs/architecture/` component doc exists yet for admin-settings or for the Mastra agent/model layer (verified: `docs/architecture/` has no matching file). This spec does not create one — the admin-settings feature itself is still a draft/placeholder on this same branch, so a permanent architecture doc is premature until that lands. Logged as a gap, not silently skipped: once admin-settings is confirmed and merged, a follow-up should document the model-tier cascade in `docs/architecture/curriculum/model-selection.md` or similar.

### Decisions made autonomously
- Tier is a curated 3-value enum (cheap/balanced/premium mapped server-side to specific OpenRouter model ids), not a free-text model id per subject/curriculum — keeps subject/curriculum owners from picking an unavailable or absurdly expensive model, and keeps the OpenRouter credential's blast radius bounded. Reversible: add a 4th "custom" tier later if needed.
- Global default tier is `cheap`, mapped to `deepseek/deepseek-v4-flash-latest` ($0.0786/$0.1572 per M tokens in/out on OpenRouter as of this research) — cheaper than the current `gpt-4o-mini` default and text-capable (unlike `TRANSCRIPTION_MODEL`, which needs audio and stays untouched).
- `balanced` tier maps to the current default, `openai/gpt-4o-mini`, so nothing gets more expensive for anyone who explicitly opts up from the new cheap default.
- `premium` tier maps to `deepseek/deepseek-v4-pro` (better DeepSeek line reasoning without leaving the same provider/credential) rather than introducing a second non-DeepSeek premium option — reversible, revisit if quality on curriculum-shaping tasks demands a different premium model.
- All ~19 Mastra agents (mentor, study-chat, decide, socratic, language-chat, curriculum-shaping, etc.) read the same resolved-tier cascade, not just curriculum-shaping — user confirmed this should extend app-wide. Every agent not otherwise given a subject/curriculum-scoped override simply resolves to the global default tier (no per-agent override surface in this pass — only subject/curriculum scope the cascade, per the original request). This widens Phase 2's "Call-site wiring" to every `resolveAgentModel` call site, not just the 2 curriculum-shaping ones + 2 grounding modules.
- `resolveAgentModel(env)`'s signature changes to accept an already-resolved model id rather than reading `env.CURRICULUM_MODEL` itself; every call site now passes a resolved tier's model id — the global tier for agents with no subject/curriculum context available (e.g. mentor, decide), the cascaded tier for curriculum/subject-scoped ones.
- Subject/curriculum override picker lives directly on each entity's existing settings/edit surface (a new "Model tier" field alongside other subject/curriculum-level settings already there), with an explicit "Inherit (currently: X)" option as the unset state — consistent with how `topics.depth` already surfaces inherited vs. explicit state elsewhere in this app. Not folded into the admin-settings page, since that page is for the one global default, not a searchable list of every subject/curriculum.
- Building in place on the existing in-progress `admin-settings` scaffold on this same branch (not waiting for it to merge separately, not rebasing) — it was evidently built in anticipation of exactly this feature (matches branch name, single placeholder toggle with no other consumer), and this is a solo personal project with no parallel-branch conflict risk.

### Implementation order
1. `tierToModelId` deriver — pure map, no I/O, covers scenario 6
2. `resolveModelTier` deriver — pure cascade logic (curriculum → subject → global), covers scenarios 1-3
3. Schema migration — add the 3 `model_tier` columns, generated via drizzle-kit then run through the existing migrate script
4. `admin-settings` repo/controller/shared-schema update to read/write global `modelTier`
5. `resolveAgentModel` signature change + the 2 curriculum-shaping agent call sites
6. `tech-research-grounding.ts` and `probe-grounding.ts` — thread subject/curriculum id through, call the resolver
7. Web: admin-settings global tier picker
8. Web: subject/curriculum override picker with an explicit "inherit" state

### Scope boundary
- Every Mastra agent's `model:` field is wired through the shared `dynamicResolvedModel` resolver (`apps/api/src/mastra/model.ts`), reading `subjectId`/`curriculumId` off the live Mastra `requestContext`. Call sites where a single unambiguous curriculum or subject is available in scope (curriculum-architect, structure-editor, lecture-compiler, lecture-source-selector, cards-compiler, study-material-writer, mentor-ask/eval, socratic-eval, study-chat/language-chat, learning-list-slice, learning-list-classifier, writing-check, phrase-batch-generate, domain-priority-review, doc-scan, domain-taxonomy-mapping, sibling-discovery) pass that id through, so they cascade for real.
- The two direct-fetch grounding modules (`tech-research-grounding.ts`, `probe-grounding.ts`) follow the same rule — every caller of `probe-grounding.ts`'s shared `webSearch` passes a scope, including `study-material.orchestrator.ts`'s own web-grounding call and `stats.service.ts`'s course-stats "further reading" recommendation call.
- Only genuinely scope-less call sites intentionally resolve to the global default tier only: batched probe-quiz generation spanning multiple curricula in one call, and `decide`'s cross-curriculum blind-spot analysis (no single curriculum to attribute the call to). Both silently fall to the cheapest tier if the global default is cheap, never to a pricier one — not a cost risk, but a real (accepted) gap in per-course control for those two paths specifically.
- `TRANSCRIPTION_MODEL` is untouched — separate concern, audio-only.
- No per-call runtime cost tracking/budgeting dashboard — this is model selection only, not spend monitoring.
- No "custom model id" free-text tier in this pass.
