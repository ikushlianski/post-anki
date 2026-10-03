---
type: scenarios
direction: exam-prep-from-sources
task: "Let the learner pick which subject or tag a mock exam draws from"
updated: 2026-10-03
---

# Scenarios: mock-exam scope picker

## S1 — Default stays unchanged
A learner who never touches the picker gets exactly today's behavior: a curriculum-scope exam over `curriculumId`. No regression for the existing `mock-exam-complete`/`mock-exam-timeout` e2e specs.

## S2 — Picking a module scopes the exam to it
Picking a module ("subject") and starting generates an exam whose questions come only from that module (server already enforces this via `scope: "module", scopeId`). The URL search params record the picked scope/scopeId.

## S3 — Picking a tag scopes the exam to it
Same as S2, but for a tag attached to this curriculum's modules/topics — picking it generates a tag-scope exam.

## S4 — Reload resumes the right exam
After starting a module- or tag-scope exam, reloading the page (same URL, with its search params) resumes that same in-progress exam — not a curriculum-scope one.

## S5 — Retake keeps the picker live
"Take another exam" returns to the start screen with the picker still available (not stuck on whatever scope the just-finished exam used) — the learner can pick a different module/tag for the retake.

## S6 — No modules/tags available
A curriculum with no tags and only its own content still shows the picker with just "This whole curriculum" selectable — never a broken/empty picker.

## Files by scenario
| Scenario | Files |
|---|---|
| S1, S4, S5 | `apps/web/src/routes/curriculum.$curriculumId_.exam.tsx`, `apps/web/src/exam/mock-exam-session.tsx` |
| S2, S3, S6 | `apps/web/src/exam/mock-exam-start.tsx`, `apps/web/src/exam/mock-exam-session.tsx` |
| All | verification-repo e2e: extend `mock-exam-complete` or add a new scenario for a module/tag-scope exam |
