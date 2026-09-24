# Local todo — variant-attempts

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add knowledgeBitVariantAttempts table + migration
- [x] Add knowledge-bit-answer-grader Mastra agent (cheap tier, grades against variant prompt/answer)
- [x] Add getQuestionVariantById + insertVariantAttempt repo functions
- [x] Add grade-knowledge-bit-variant-answer orchestrator (404 on missing variant)
- [x] Wire POST /knowledge-bits/question-variants/:id/answers route
- [x] Tests: agent, orchestrator (grade/404/history-preserved), route, repo integration

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed.

## Resolved
- Pass 1 review: grading agent never learned the variant's kind, so a correct fill-in-the-blank
  answer (reference answer is a bare term, no reasoning) could get marked incomplete under a
  reasoning-only rubric. Fixed by threading `kind` through the repo/orchestrator/agent and making
  the verdict-grading paragraph kind-conditional.
- Pass 2 review: the Pass 1 fix left the `score` field's definition and the instructions' opening
  framing still assuming every question needs reasoning, so `score` (unlike `verdict`) could still
  be marked down for a correct fill-in-the-blank answer. Fixed by making both kind-conditional too.
- Pass 3 review (independent, after the Pass 2 fix): PASS — confirmed both `score` and the opening
  framing are now kind-conditional, no remaining reasoning-only assumption found, tsc/tests clean.
