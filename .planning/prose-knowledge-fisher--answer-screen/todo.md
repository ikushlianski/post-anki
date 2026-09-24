# Local todo — answer-screen

## Decisions to make
- None open — MVP fairness ordering (fewest attempts first) chosen over a full recall-recycling
  scheduler, per plan.md's Non-goals.

## To review-clarify
- None open.

## Coding tasks
- [x] Endpoint: GET next-batch of variants, fewest-attempts-first, optional tagId filter
- [x] UI: answer screen (one question at a time, submit, show feedback, advance)
- [x] Wire tag-strength badge to link into this screen scoped by tag
- [x] Tests: repo/controller/integration + RTL component test

## Manual steps
- None.

## Post-deploy checks
- None — no schema change.

## Resolved
- Phase 1 shipped: knowledge-bit-question-variant.repo.ts:listNextQuestionVariantsToAnswer
  (fewest-attempts-first via LEFT JOIN + count, optional tagId filter via inArray subquery on
  tagAssignments), wired as GET /knowledge-bits/question-variants/next (commit 0512d2d). tsc clean,
  3 integration tests + full knowledge-bit unit suite (124 tests) green.
- Phase 2 shipped: knowledge.answer.tsx route (one-question-at-a-time, submit, inline
  verdict/feedback/follow-up, batch advance + re-fetch on exhaustion), listNextQuestionVariants
  and gradeQuestionVariantAnswer web API client functions, tag-list badge now links into
  /knowledge/answer?tagId=, onMerged cache-invalidation bug fixed (now also invalidates
  tags-mastery), sidebar nav link added. tsc clean, 4 RTL tests green (2 answer-screen, 2 tag-list).
  Real-browser check not performed (no browser tool available this session); dev server + curl
  confirmed a 200 on /knowledge/answer as a fallback.
