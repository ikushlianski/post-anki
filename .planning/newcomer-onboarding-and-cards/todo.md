---
type: todo
run: newcomer-onboarding-and-cards
state: closed
updated: 2026-08-07
---

## Coding tasks

- [x] Build curriculum-wide calibration probe (10-20 questions, per-topic strong/weak picture)
  - [x] Add "curriculum" scope to probeScopeSchema and batch generation
    - schema: packages/shared/src/probe-session.ts:3
    - priority-weighted topic plan: packages/core/src/probe-session/curriculum-plan.ts:1, tested packages/core/src/probe-session/curriculum-plan.test.ts:1
    - one-shot-scope guard (core): packages/core/src/probe-session/replenish.ts:19, tested packages/core/src/probe-session/replenish.test.ts:37
    - getScopeContext "curriculum" branch: apps/api/src/probe-session/probe-session.repo.ts:325-368 (new getCurriculumScopeContext), priority added to ScopeTopic + tag-scope topic rows (apps/api/src/tag/tag.repo.ts:175, 228)
    - generation targeting/prompt: apps/api/src/probe-session/probe-session.generate.ts (curriculumPlanFor, targetTotal curriculum branch, buildPrompt curriculum branch, narrowToCurriculumPlan)
    - server-side one-shot replenish guard: apps/api/src/probe-session/probe-session.service.ts (maybeReplenish, isOneShotProbeScope check)
    - apps/api typecheck clean, apps/api vitest 254/254 passing (default sweep, excludes DB-backed integration tests per vitest.config.ts)
  - [x] Wire assess route to offer the generated quiz, summarize results
    - route rework (kept self-grade, added "Take a quick level check"): apps/web/src/routes/curriculum.$curriculumId_.assess.tsx:1
    - per-topic strong/weak deriver + tests: apps/web/src/curriculum/probe-topic-summary.ts:1, apps/web/src/curriculum/probe-topic-summary.test.ts:1
    - client one-shot-scope guard so the completed session isn't wiped by refetch-on-low: apps/web/src/curriculum/probe-session-quiz.tsx:191-212 (exported probeSessionQueryKey at :26)
    - regression test proving the guard is load-bearing (temporarily removed it, confirmed this test fails, restored it): apps/web/src/curriculum/probe-session-quiz.test.tsx:1
    - apps/web typecheck clean, apps/web vitest 106/106 passing
  - [x] Gate TanStack Devtools panel to dev-only
    - apps/web/src/routes/__root.tsx:93-105 (`import.meta.env.DEV` guard, confirmed Vite ^8 is the build tool)
  - [x] Add a way back from the topic-unavailable empty state
    - apps/web/src/routes/probe.$topicId.tsx:43-59 (reuses curriculumId already in the route's search params, no new fetch)
- [x] Build Anki-style card mode (3-5 phrasing variants per concept, AI-generated only)

## To review / clarify

- `.product/DECISIONS.md:179` previously listed Anki-style cards as "future" — user requested it
  directly with a concrete design; noted, not treated as a blocker.

## Manual steps

- Curriculum-wide calibration probe: not yet exercised end-to-end against a live LLM call — the
  local docker DB (post-anki-dev-db, postanki_dev) has 0 curricula rows, so there was no confirmed
  curriculum to actually generate a batch against, and doing so would cost a real OpenRouter call.
  Verified instead via full typecheck + vitest (all 4 packages green) and manual code tracing.
  Before relying on this in the real product: confirm/create a curriculum locally, click "Take a
  quick level check" on its /assess page, and check `probe_session_questions.topic_id` in Postgres
  isn't skewed onto one topic (would indicate the model is paraphrasing topic titles past what
  `normalize()` in probe-session.map.ts matches).

- Cards mode: repo/controller/routing verified against real local Postgres and curl, but no real
  LLM call was made (still 0 curricula locally) — click "Generate cards" on a real topic's
  `/cards/:topicId` page once one exists, to confirm the compiler's output quality.

## Post-deploy checks

- None yet — nothing in this run touches prod/Neon.
