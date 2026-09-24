# Local todo — auto-tag-knowledge-bits

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- Fix listKnowledgeBitsForTaggingScan test — mock hides an AND/OR predicate bug
- [x] Add `TagNodeType` union in shared/tag.ts, widen assignTag/addTagAssignment to accept it
- [x] Add `taggedAt`/`tagFailedAt` columns to `knowledgeBits` in schema.ts, generate + apply migration
- [x] Add `knowledge-bit-tagging.repo.ts` with the selection query and the two status-write functions
- [ ] Add `knowledge-bit-tagger.agent.ts`, a cheap-tier classifier returning up to 3 candidate tag names
- [ ] Add `knowledge-bit-tagging.orchestrator.ts` that tags each bit, isolates per-bit failures, caps the batch
- [ ] Wire a `POST /knowledge-bits/tagging-scan` trigger route through router-table/router/server
- [ ] Add unit tests for the orchestrator covering tag-and-mark-tagged, close-match reuse, per-bit failure isolation, and batch cap
- [ ] Add a real-Postgres integration test for the selection query and a full tag-assignment write-back, in its own file

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond the column defaults (all nullable).

## Resolved
- None yet.
