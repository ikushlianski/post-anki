---
type: todo
direction: exam-prep-from-sources
task: "Build a mock-exam session: fixed question count, timer, final score"
updated: 2026-10-03
---
## Coding tasks
- [x] Add `mode` column migration on `probe_sessions` (`practice` default, `exam`), shared enum.
- [x] Thread `mode` through `getActiveSessionRow`, `getCalibrationCompletionForCurriculum`, `deleteSessionsForScope`, `createSessionWithQuestions`.
- [x] Add `targetCount` to `prepareProbeSessionInput`, validate against `[10, 20, 30]` for exam mode.
- [x] Add `targetCount` param to `generateProbeBatch`, bypassing `targetTotal()` when present.
- [x] Guard `maybeReplenish`, `electDepthsOnCalibrationCompletion`, and gap-mastery/topic-progress calls in `answerProbeSession` on `mode === "exam"`.
- [x] Update every existing caller of the now-mode-aware repo functions to pass `"practice"` explicitly.
- [x] Write RED Playwright test: start exam, answer all questions, see final score; timer visible. (verification-repo: `projects/post-anki/post-anki/features/exam/tests/{mock-exam-complete,mock-exam-timeout}/test.ts`, both passing)
- [x] Build the mock-exam start screen + timer header + final-score screen (reusing the existing quiz component).
- [x] Verify in a real browser via `/check-ui` before marking done. (2026-10-03: seeded a confirmed curriculum in dev, drove the real start screen through Playwright against the live dev stack — found and fixed a silent-failure bug where a generation error resolved the mutation to `null` instead of surfacing an error)
## Notes
- Scope/scopeId picker UI is the separate, later todo item — this unit's start screen only needs a question-count picker against the current curriculum.
