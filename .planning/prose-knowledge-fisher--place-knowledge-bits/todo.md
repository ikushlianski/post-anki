# Local todo — place-knowledge-bits

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add a unit test for the placer agent's refine/parse/throw behavior
- [x] Add `topicId`/`placementSuggestion`/`placementCheckedAt`/`placementFailedAt` columns to `knowledgeBits`, generate + apply migration
- [x] Add `knowledge-bit-placer.agent.ts`, a cheap-tier classifier returning a matched topic id or a placement suggestion
- [ ] Add `knowledge-bit-placement.repo.ts` with the filtered topic listing, selection query, and the three status-write functions
- [ ] Add `knowledge-bit-placement.orchestrator.ts` that places each bit, validates the matched topic id against the sent list, isolates per-bit failures, caps the batch
- [ ] Wire a `POST /knowledge-bits/placement-scan` trigger route through router-table/router/server
- [ ] Add unit tests for the orchestrator covering match, suggestion, hallucinated-id fallback, per-bit failure isolation, and batch cap
- [ ] Add a real-Postgres integration test for the selection query, filtered topic listing, and a full placement write-back, in its own file

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond the column defaults (all nullable).

## Resolved
- None yet.
