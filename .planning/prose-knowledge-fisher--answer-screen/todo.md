# Local todo — answer-screen

## Decisions to make
- None open — MVP fairness ordering (fewest attempts first) chosen over a full recall-recycling
  scheduler, per plan.md's Non-goals.

## To review-clarify
- None open.

## Coding tasks
- [x] Endpoint: GET next-batch of variants, fewest-attempts-first, optional tagId filter
- [ ] UI: answer screen (one question at a time, submit, show feedback, advance)
- [ ] Wire tag-strength badge to link into this screen scoped by tag
- [ ] Tests: repo/controller/integration + RTL component test

## Manual steps
- None.

## Post-deploy checks
- None — no schema change.

## Resolved
- Phase 1 shipped: knowledge-bit-question-variant.repo.ts:listNextQuestionVariantsToAnswer
  (fewest-attempts-first via LEFT JOIN + count, optional tagId filter via inArray subquery on
  tagAssignments), wired as GET /knowledge-bits/question-variants/next (commit 0512d2d). tsc clean,
  3 integration tests + full knowledge-bit unit suite (124 tests) green.
