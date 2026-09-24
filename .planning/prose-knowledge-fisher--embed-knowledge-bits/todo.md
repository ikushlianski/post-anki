# Local todo — embed-knowledge-bits

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add orchestrator tests for scan-limit call arg, id-based result mapping, and embedTexts rejection propagation
- [x] Add `embedding`/`embeddingHash`/`embeddedAt` columns to `knowledgeBits` in schema.ts, generate + apply migration
- [x] Add `knowledge-bit-embedding.repo.ts` with the selection query and the write-back update
- [x] Add `knowledge-bit-embedding.orchestrator.ts` that hashes, skips unchanged, caps the batch, embeds, writes back
- [x] Wire a `POST /knowledge-bits/embedding-scan` trigger route through router-table/router/server
- [x] Add unit tests for the orchestrator covering embed, skip-on-matching-hash, and batch cap
- [x] Add a real-Postgres integration test for the selection query and the write-back, in its own file

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed beyond the column defaults (all nullable).

## Resolved
- None yet.
