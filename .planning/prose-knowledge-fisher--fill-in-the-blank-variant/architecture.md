# Architecture — fill-in-the-blank variant

## Non-goals (restated)

- No changes to the wh_question generation path, its agent, or its columns.
- No embedding of the new variant yet.
- No learner-facing serving of either variant kind.
- No tagging-system or taxonomy-cap touches.
- No admin UI.
- No retry loop for a failed generation — `fillBlankGenerationFailedAt` stays terminal, same as
  every other generation/tagging/placement failure in this codebase.

## Rollback note

Fully additive: two new nullable columns on `knowledgeBits`, one new agent file, new repo
functions appended to the existing question-variant repo, one new orchestrator, one new route, one
new enum member on an existing shared type. No FK constraints, matching `knowledgeBits`' and
`knowledgeBitQuestionVariants`' existing no-FK convention. Revert path: drop the migration, delete
the new agent/orchestrator files, remove the added repo functions and route entries, drop the enum
member.
