---
type: scenarios
direction: exam-prep-from-sources
task: "Build a mock-exam session: fixed question count, timer, final score"
updated: 2026-10-03
---

# Scenarios: mock-exam session

## S1 — Starting an exam never returns an in-progress practice session
A learner with an active practice quiz on curriculum C starts an exam on curriculum C.
`prepareProbeSession({ scope: "curriculum", scopeId: C, mode: "exam", targetCount: 10 })` creates a
brand-new session with `mode: "exam"` — it does not return, delete, or otherwise touch the existing
practice session.

## S2 — An exam has exactly the requested number of questions, forever
A 10-question exam is created. No matter how many answers are submitted, `total` never changes —
`maybeReplenish` never fires for `mode: "exam"` (checked for topic, module, tag, and curriculum
scope, not just curriculum).

## S3 — An exam on curriculum scope never elects topic depth or unlocks calibration
A learner with no completed curriculum-scope practice session takes and completes a curriculum-
scope exam. `isSocraticGatedByCalibration` still reports gated (unaffected) and no topic's
`depth`/`depthElectedAt` changes.

## S4 — An exam answer never touches gap mastery or topic progress
Answering an exam question whose generated `gapLabel` matches an existing open gap does not call
`applyGapMasteryAttempt`, does not change that gap's mastery stage, and does not change the
topic's `progressMaturity`/`learningStatus`. The same question bank, answered in a practice
session, does advance gap mastery — proving the branch is on `mode`, not on question content.

## S5 — An exam's answers still count toward answered-question history
`countQuestionsAnswered()` and the per-gap analytics performance query both include an exam's
answered questions, same as a practice session's.

## S6 — `targetCount` is capped to a fixed, safe menu
`prepareProbeSession({ ..., mode: "exam", targetCount: 10 })`, `20`, and `30` all succeed.
`targetCount: 15` (or any value outside `[10, 20, 30]`) is rejected with a 400, no session created.
`targetCount` is ignored (no validation, no effect) when `mode` is omitted or `"practice"`.

## S7 — End-to-end: take a timed exam to completion (Playwright, RED first)
Learner opens the mock-exam start screen, picks a question count, starts the exam, answers every
question, and sees a final score screen showing correct/total. A countdown timer is visible
throughout and counts down from a value derived from the question count.

## S8 — Time running out ends the exam
With the exam's timer expired (simulated via a fake clock / short test-only duration), the learner
can no longer submit an answer to the current question, and the final-score screen renders showing
whatever was answered so far — not an error state.

## Files by scenario

| Scenario | Files |
|---|---|
| S1, S2 | `apps/api/src/probe-session/probe-session.repo.ts` (`getActiveSessionRow`, `deleteSessionsForScope`), `probe-session.service.ts` (`prepareProbeSession`, `maybeReplenish`) |
| S3 | `probe-session.repo.ts` (`getCalibrationCompletionForCurriculum`), `probe-session.service.ts` (`answerProbeSession`'s `electDepthsOnCalibrationCompletion` guard) |
| S4 | `probe-session.service.ts` (`answerProbeSession`) |
| S5 | `apps/api/src/home/home.repo.ts`, `apps/api/src/analytics/analytics.repo.ts` (no code change — proven by existing unfiltered queries) |
| S6 | `packages/shared/src/probe-session.ts` (`prepareProbeSessionInput`), `probe-session.service.ts` (`prepareProbeSession` validation), `probe-session.generate.ts` (`generateProbeBatch`'s new `targetCount` param) |
| S7, S8 | New web route/component (mock-exam start + quiz + score screen), reusing `apps/web/src/curriculum/probe-session-quiz.tsx`; e2e test under `e2e-local/` |
