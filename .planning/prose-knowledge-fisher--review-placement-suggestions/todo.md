# Local todo — review-placement-suggestions

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Fix the invalid_input controller test to actually exercise the repo error mapping
- [x] Tighten resolvePlacementSuggestionInput to a discriminated union on status
- [x] Make the repo return the shared PendingPlacementSuggestion type, not a duplicate
- [x] Add router.test.ts resolution tests for the two new placement-suggestion routes
- [x] Add GET placement-suggestions and PATCH placement-suggestion routes
- [x] BLOCKED (stuck, 3 FAILs): add reject-then-accept and double-resolve-timestamp tests
- [x] Add a test proving a placementFailedAt bit never appears in the pending suggestions list
- [x] Add tests for invalid_input and a second accept after a successful accept
- [x] Add a concurrency test proving two parallel accepts create only one topic
- [x] Sort pending placement suggestions newest first, not oldest first
- [x] Wrap resolvePlacementSuggestion's claim, topic insert, and topicId write in one transaction
- [x] Add placementSuggestionResolvedAt column to knowledgeBits, generate + apply migration
- [x] Add listPendingPlacementSuggestions and resolvePlacementSuggestion to the placement repo

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond the column default (nullable).

## Resolved
- None yet.
