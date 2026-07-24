---
type: spec
branch: learning-map-chat
task: Persistent sidebar study chat with cross-curriculum learning-map context + level-aware generation
complexity: complex
state: confirmed
updated: 2026-07-15
---
# Spec: Learning-map sidebar chat

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Core derivers + shared types | 5, 6, 7, 9 | New `packages/core` derivers (`summarizeLearningMap`, `priorLevelCoverageLabels`); new `packages/shared` schemas (`learning-map.ts`, `study-chat.ts`) | None | None | N/A (unit-tested) |
| 2 — API wiring | 1, 2, 3, 4, 5, 8, 9 | `curriculum.repo.ts` (`getLearningMapSnapshots`, `getLowerLevelCoverage`); new `study-chat` module (controller + service); new `study-chat.agent.ts`; `mastra.ts` registration; `probe-session.generate.ts` + `probe.service.ts` level-aware context injection | None | Phase 1 | Chat call is one agent round-trip, same shape as existing Socratic eval call; level-coverage lookup adds one query, not N+1 |
| 3 — Web frontend | 1, 2, 3, 4, 8 | None (consumes Phase 2 API) | `study-chat.api.ts`; `study-chat-sidebar.tsx`; `probe.$topicId.tsx` wiring; "ask about this" trigger added to `probe-session-quiz.tsx` | Phase 2 **and** `topic-study-experience`'s `probe-session-quiz.tsx`/`probe.$topicId.tsx` must already exist — this plan modifies files that sibling plan creates | Loading/typing indicator visible for the full in-flight chat call |
| 4 — Regression verification | 6 | None — confirms `probe-session.service.ts`/`socratic.service.ts` mastery/review behavior is unchanged | None | Phases 1–3 | N/A |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `summarizeLearningMap` (`packages/core/src/curriculum/learning-map.ts`, new) | `snapshots: LearningMapSnapshot[]` | `string` (compact, ranked, budget-capped summary block) | SCENARIO 3, 7 |
| `priorLevelCoverageLabels` (`packages/core/src/curriculum/level-context.ts`, new) | `currentLevel: Level \| null`, `moduleCoverages: { level: Level \| null; coveredLabels: string[] }[]` | `string[]` (covered labels from strictly lower-rank levels, empty if `currentLevel` is `null`) | SCENARIO 5, 9 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | None | `apps/web/src/routes/probe.$topicId.tsx` — mounts `StudyChatSidebar` alongside whichever mode is active; `apps/web/src/curriculum/study-chat-sidebar.tsx` — new | None |
| SCENARIO 2 | `apps/api/src/study-chat/study-chat.service.ts` — accepts optional seed context | `apps/web/src/curriculum/probe-session-quiz.tsx` — "ask about this" trigger on a graded question, opens sidebar pre-filled; `study-chat-sidebar.tsx` — renders seeded draft | None |
| SCENARIO 3 | `study-chat.service.ts` — system prompt assembly; `apps/api/src/curriculum/curriculum.repo.ts` — `getLearningMapSnapshots`; `packages/core/src/curriculum/learning-map.ts` | `study-chat-sidebar.tsx` — renders comparison answers | None |
| SCENARIO 4 | `study-chat.service.ts` — accepts client-supplied transcript array | `study-chat-sidebar.tsx` — keeps in-tab transcript state, sends full history each call | None |
| SCENARIO 5 | `apps/api/src/probe-session/probe-session.generate.ts`, `apps/api/src/probe/probe.service.ts` (`AskContext` + `generateQuestion`), `curriculum.repo.ts` (`getLowerLevelCoverage`), `packages/core/src/curriculum/level-context.ts` | None | None |
| SCENARIO 6 | None new — verifies `apps/api/src/probe-session/probe-session.service.ts`, `apps/api/src/socratic/socratic.service.ts`, `packages/core/src/curriculum/gap.ts`/`progress.ts` unmodified | None | None |
| SCENARIO 7 | `packages/core/src/curriculum/learning-map.ts` (budget/ranking logic, same deriver as SCENARIO 3) | None | None |
| SCENARIO 8 | `study-chat.service.ts` — try/catch fallback reply, same pattern as `probe-grounding.ts`'s `webGround` | `study-chat-sidebar.tsx` — surfaces fallback message, no duplicate transcript entry on failure | None |
| SCENARIO 9 | `curriculum.repo.ts` (`getLowerLevelCoverage` — single joined query) | None | None |

### Files to create

```
packages/core/src/curriculum/
  learning-map.ts          — summarizeLearningMap deriver
  learning-map.test.ts
  level-context.ts         — priorLevelCoverageLabels deriver
  level-context.test.ts

packages/shared/src/
  learning-map.ts           — learningMapSnapshotSchema / LearningMapSnapshot
  study-chat.ts              — chatMessageSchema, askStudyChatInput, askStudyChatResultSchema

apps/api/src/study-chat/
  study-chat.controller.ts  — HTTP entry (mirrors socratic.controller.ts's shape)
  study-chat.service.ts     — askStudyChat(): assembles system prompt (topic detail + learning-map
                                summary + level context if applicable + client transcript + optional
                                seed), calls the chat agent, returns reply or fallback

apps/api/src/mastra/
  study-chat.agent.ts       — free-form tutoring/comparison agent instructions (no grading, no
                                structured output — plain text reply)

apps/web/src/curriculum/
  study-chat.api.ts         — createServerFn wrapper for askStudyChat (mirrors socratic.api.ts
                                pattern from the sibling plan)
  study-chat-sidebar.tsx    — chat UI: message bubbles, input, typing indicator, "ask about this"
                                seed rendering
```

### Files to modify

```
apps/api/src/
  curriculum/curriculum.repo.ts   — + getLearningMapSnapshots() (all confirmed curricula, per-module
                                      level + ModuleProgress + per-topic TopicProgress, reusing
                                      existing moduleProgress/curriculumProgress derivers);
                                      + getLowerLevelCoverage(topicId) (single query joining
                                      topics→modules→gaps for the topic's curriculum)
  probe-session/probe-session.generate.ts — buildPrompt appends prior-lower-level-coverage line
                                      when priorLevelCoverageLabels() is non-empty
  probe/probe.service.ts          — AskContext gains optional priorLevelCoverage: string[];
                                      generateQuestion appends it to the focus lines sent to
                                      mentorAsk when present (this is the Socratic turn-prompt path,
                                      called via buildProbeQuestionForGap from socratic.service.ts)
  mastra/mastra.ts                — register AGENT_KEYS.studyChat / createStudyChatAgent()

apps/web/src/
  routes/probe.$topicId.tsx       — mounts StudyChatSidebar alongside the active mode's panel;
                                      layout/breadcrumb/drawer unchanged (sibling plan already
                                      owns this file's mode-switching internals)
  curriculum/probe-session-quiz.tsx — adds an "ask about this" affordance on a graded question
                                      (sibling-plan-owned file; this plan only adds the trigger)
```

**Not modified, confirmed by direct code check:**
- `apps/api/src/socratic/socratic.service.ts`, `apps/api/src/probe-session/probe-session.service.ts` — mastery/review semantics (SCENARIO 6) already correct as-is; no gap-regression/demotion logic added (see Decisions).
- `apps/api/src/socratic/socratic.controller.ts`, `startSocraticSession`/`answerSocraticSession` contracts — untouched; this plan's chat is a fully separate surface.
- `apps/bot/src/**` — this plan is web-only; the bot has no sidebar-chat equivalent and none is added.

### Data model changes

Not applicable. This plan is entirely additive read-aggregation over existing tables
(`curricula`, `modules`, `topics`, `gaps`) plus one new stateless LLM call path. No new tables,
no new columns, no migration.

### Documentation changes

No existing doc under `docs/` covers the study-chat or level-aware-generation architecture. Per
the mandatory rule for a plan that writes `architecture.md`: a short Mermaid diagram of this
architecture will be published to `docs/architecture/learning-map-chat.md` during implementation.

### Decisions made autonomously

1. **New, distinct chat surface rather than reusing `startSocraticSession`/`answerSocraticSession`** — that API is turn-graded and gap-advancing by design; a free-form question-answering surface has no grading and no fixed sequence, and bolting it onto the graded schema would break its invariants or require an ungraded branch on a schema built for grading.
2. **`SocraticChat` presentational-component reuse deferred to implementation** — it doesn't exist in `main` at plan time (parallel worktree), so its internal decomposition can't be inspected; default is a small, cheap duplication of bubble/input JSX now, with extraction left as an implementer's call if the sibling component turns out to expose clean sub-pieces.
3. **One shared cross-curriculum aggregation query, owned here, consumed by `study-stats-dashboard`** — both plans need the same non-exploding view of progress across all curricula; defining it twice would either drift or double the DB load. `getLearningMapSnapshots()` lands in this plan; the sibling plan's next-step recommender and stats view consume it directly rather than re-deriving.
4. **Gap regression/demotion not built** — verified directly that `answerProbeSession`/`answerSocraticSession` already satisfy "wrong answers go to review, right answers count toward mastery" (a wrong answer simply never leaves a gap's default `open` state), and demoting an already-`covered` gap back to `open` on a later wrong answer was never requested. Building it now would silently change already-shipped scoring for every existing curriculum — logged, not built.
5. **Learning-map summary budget: 10 curricula / 1,200 characters, ranked in-progress-first** — a concrete, testable default so SCENARIO 7 has something exact to assert against; the alternative (an unbounded dump) is exactly the token-cost problem the task called out to avoid.
6. **Level-aware coverage is a flat text hint appended to existing prompt-building functions, not a new structured schema field** — it's steering guidance for the model, not data the caller needs to read back structured, so it doesn't warrant widening `generatedProbeBatchSchema`/`socraticEvalSchema`.
7. **`LearningMapSnapshot` type lives in `packages/shared`, not duplicated per-package** — both `packages/core` derivers (this plan's `summarizeLearningMap`, the sibling's `nextStepRecommendation`) and the `apps/api` repo function that produces it need one shared contract, matching how `Module`/`Topic` already work.
8. **Chat transcript is session-local (browser tab), never server-persisted** — matches the sibling plan's identical decision for `SocraticChat`'s transcript, keeping both chat surfaces on the same page behave consistently on reload.
9. **Level-aware injection reuses the existing `AskContext`/grounding plumbing in `probe.service.ts` rather than a parallel prompt path** — that file already threads `grounding`/`citations`/`speed`/`hinting` into `generateQuestion`; adding `priorLevelCoverage` to the same context object is the smallest change that reaches the actual prompt-assembly point.

### Implementation order

1. `/tdd summarizeLearningMap` — covers SCENARIO 3, 7
2. `/tdd priorLevelCoverageLabels` — covers SCENARIO 5, 9
3. `packages/shared` — `learning-map.ts`, `study-chat.ts` schemas
4. `curriculum.repo.ts` — `getLearningMapSnapshots`, `getLowerLevelCoverage`
5. `probe-session.generate.ts` + `probe.service.ts` — wire level-aware context injection
6. `mastra/study-chat.agent.ts` + `mastra.ts` registration
7. `apps/api/src/study-chat/` — service + controller
8. Frontend: `study-chat.api.ts` client wrapper
9. Frontend: `study-chat-sidebar.tsx` component
10. Wire into `probe.$topicId.tsx`; add "ask about this" trigger to `probe-session-quiz.tsx`
11. Regression check: `probe-session.service.ts`/`socratic.service.ts` mastery/review logic — verify only, no change expected
12. Publish `docs/architecture/learning-map-chat.md`

### Scope boundary

Out of scope: curriculum creation/research pipeline internals; Socratic turn-by-turn grading
mechanics and quiz scoring (reused as-is); gap-regression/demotion (forgetting mechanic);
quiz-answer-level citation/explanation grounding (owned by the parallel "quiz generation
fidelity" plan — this plan's chat consumes existing grounding text where already available but
does not redesign how citations are fetched or stored); per-question/per-turn thumbs-up/down
feedback and promote/demote signals (owned by the parallel "feedback/promote-demote" plan); the
stats/dashboard page, next-step recommendation UI, and streaks (owned by `study-stats-dashboard`,
which this plan's `getLearningMapSnapshots()` unblocks); any Telegram bot UI or chat-mode surface.
