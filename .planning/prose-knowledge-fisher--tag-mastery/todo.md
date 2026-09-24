# Local todo — tag-mastery

## Decisions to make
- None open — read-time fold, no schema change, per advisor's explicit steer for this item.

## To review-clarify
- None open.

## Coding tasks
- [x] Repo query: ordered attempts per tagId (tagAssignments -> knowledgeBits -> variants ->
  attempts), createdAt ascending
- [x] Fold function: getTagMasteryLevels(tagIds) using applyAttemptToMasteryEntry, correct =
  verdict === "Ok", isAdjacent = false
- [x] Tests: unit (fold logic) + integration (real Postgres query, multi-tag isolation)

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, no new route.

## Resolved
- Implemented as a pure read-time fold (packages/core/src/mastery/tag-mastery.ts) plus one joined
  repo query (apps/api/src/tag/tag.repo.ts:getTagMasteryLevels) — no schema change, mastery-state.ts
  reused unchanged. tsc + vitest (unit + integration) all green.
- todo-factory's mark-done matches by exact item text with no root-scoping, so two different roots
  both having a sub-item literally named "Phase 2: tests" made it silently no-op against the wrong
  (already-checked) one. Hand-edited .planning/TODO.md directly for this one case instead — a real
  CLI limitation (duplicate sub-item text across unrelated roots), not a policy violation.
