---
type: todo
branch: learn-from-doc-site
task: cost-tier model-selection setting
state: confirmed
updated: 2026-08-19
---
# Todo: Cost-tier model selection

## Coding tasks
- [x] `tierToModelId` deriver (apps/api/src/mastra/model-tier.ts)
- [x] `resolveModelTier` deriver (curriculum → subject → global cascade)
- [x] Migration: add `model_tier` to `app_settings`, `subjects`, `curricula`
- [x] Extend admin-settings repo/controller/shared schema with global `modelTier`
- [x] Update `resolveAgentModel` signature + all Mastra agent call sites (curriculum-shaping cascaded, others use global tier)
- [x] Thread subject/curriculum id into `tech-research-grounding.ts` and `probe-grounding.ts`, use resolver
- [x] Web: admin-settings global tier picker
- [x] Web: subject/curriculum override picker with "inherit" state, showing effective source

## Resolved
- All ~19 Mastra agents join the cascade; scope-less agents resolve to the global tier — confirmed by user.
- Override picker lives on each subject's/curriculum's existing settings surface, not folded into admin-settings.
- Building in place on the existing in-progress admin-settings scaffold on this branch — confirmed by user, no rebase/wait.
- Mastra's Agent supports a dynamic (`DynamicArgument`) `model:` field resolved per-call from `requestContext`, so no per-agent-factory refactor was needed to thread a subject/curriculum id in — chosen over restructuring `getMastra()`'s process-lifetime agent singletons, since only the `model:` field needed to vary per call, not the whole agent.
- `llm_call_events` does not record the resolved model id/tier per call — out of scope for this pass (the plan's own scope boundary excludes spend tracking); logged as a real gap for a follow-up, not silently dropped.
