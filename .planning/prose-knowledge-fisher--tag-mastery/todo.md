# Local todo — tag-mastery

## Decisions to make
- None open — read-time fold, no schema change, per advisor's explicit steer for this item.

## To review-clarify
- None open.

## Coding tasks
- [ ] Repo query: ordered attempts per tagId (tagAssignments -> knowledgeBits -> variants ->
  attempts), createdAt ascending
- [ ] Fold function: getTagMasteryLevels(tagIds) using applyAttemptToMasteryEntry, correct =
  verdict === "Ok", isAdjacent = false
- [ ] Tests: unit (fold logic) + integration (real Postgres query, multi-tag isolation)

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, no new route.

## Resolved
- None yet.
