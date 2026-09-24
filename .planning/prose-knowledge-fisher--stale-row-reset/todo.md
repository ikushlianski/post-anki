# Local todo — stale-row-reset

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- Remove the explanatory comment inside the late-finishing-attempt test body
- Split knowledge-bit.repo.test.ts (473 lines) into smaller co-located test files, under 300 lines each
- Add a real-Postgres integration test proving a claimed token round-trips and a stale token is rejected after reclaim
- [x] Guard final writes with the claim's own updatedAt so a reclaimed row can't be corrupted
- [x] Add `updatedAt` column to `knowledgeSources` in schema.ts, generate + apply migration
- [x] Set `updatedAt` on every status-changing write (claim, markFailed, insertBitsAndMarkDetected)
- [x] Add `resetStaleProcessingKnowledgeSources(staleAfterMs, db?)` to knowledge-bit.repo.ts
- [x] Call the reset at the top of `detectKnowledgeBits`, before the claim loop
- [x] Add unit tests for the repo function and the orchestrator call site
- [x] Add a real-Postgres integration test for the reset UPDATE's WHERE clause

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond the column default.

## Resolved
- None yet.
