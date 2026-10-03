---
type: todo
direction: exam-prep-from-sources
task: "Build a mock-exam session: fixed question count, timer, final score"
updated: 2026-10-03
---
## Coding tasks
- [ ] Add `mode` column migration on `probe_sessions` (`practice` default, `exam`), shared enum.
- [ ] Thread `mode` through `getActiveSessionRow`, `getCalibrationCompletionForCurriculum`, `deleteSessionsForScope`, `createSessionWithQuestions`.
- [ ] Add `targetCount` to `prepareProbeSessionInput`, validate against `[10, 20, 30]` for exam mode.
- [ ] Add `targetCount` param to `generateProbeBatch`, bypassing `targetTotal()` when present.
- [ ] Guard `maybeReplenish`, `electDepthsOnCalibrationCompletion`, and gap-mastery/topic-progress calls in `answerProbeSession` on `mode === "exam"`.
- [ ] Update every existing caller of the now-mode-aware repo functions to pass `"practice"` explicitly.
- [ ] Write RED Playwright test: start exam, answer all questions, see final score; timer visible.
- [ ] Build the mock-exam start screen + timer header + final-score screen (reusing the existing quiz component).
- [ ] Verify in a real browser via `/check-ui` before marking done.
## Notes
- Scope/scopeId picker UI is the separate, later todo item — this unit's start screen only needs a question-count picker against the current curriculum.
