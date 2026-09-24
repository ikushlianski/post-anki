# Local todo — wh-question-variant

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add agent-level test for knowledge-bit-question-generator.agent.ts (prompt build, schema, invalid-output throw)
- [x] Add knowledgeBitQuestionVariants table + whQuestionGeneratedAt/FailedAt columns, migration
- [x] Add knowledge-fisher question-generator Mastra agent (cheap tier)
- [x] Add knowledge-bit-question-variant repo (list/insert/mark helpers)
- [x] Add knowledge-bit-question-generation orchestrator (capped batch scan)
- [x] Wire POST /knowledge-bits/question-generation-scan trigger route
- [x] Tests: agent, orchestrator (success/failure/isolation/cap), route, repo integration

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond nullable defaults.

## Resolved
- None yet.
