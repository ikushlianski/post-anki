---
type: todo
direction: exam-prep-from-sources
task: "Let the learner pick which subject or tag a mock exam draws from"
updated: 2026-10-03
---
## Coding tasks
- [x] Add `scope`/`scopeId` search params to `/curriculum/$curriculumId/exam`, defaulting to curriculum scope.
- [x] Add a module/tag picker to `MockExamStart`, sourced from `curriculumDetailQuery`'s modules and their tags.
- [x] Parametrize every hardcoded `scope: 'curriculum'`/`curriculumId` use in `mock-exam-session.tsx` on the picked scope/scopeId.
- [x] Write a RED Playwright scenario for a module- or tag-scope exam, then make it pass.
- [x] Verify in a real browser via `/check-ui` before marking done (S1 default-unchanged, S2/S3 picker, S4 reload-resume).
## Notes
- "Subject" means this curriculum's own modules, not the separate Subject entity — see spec.md's "Decision made autonomously".
