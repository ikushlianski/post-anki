# Local todo — variant-attempts

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [ ] Add knowledgeBitVariantAttempts table + migration
- [ ] Add knowledge-bit-answer-grader Mastra agent (cheap tier, grades against variant prompt/answer)
- [ ] Add getQuestionVariantById + insertVariantAttempt repo functions
- [ ] Add grade-knowledge-bit-variant-answer orchestrator (404 on missing variant)
- [ ] Wire POST /knowledge-bits/question-variants/:id/answers route
- [ ] Tests: agent, orchestrator (grade/404/history-preserved), route, repo integration

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed.

## Resolved
- None yet.
