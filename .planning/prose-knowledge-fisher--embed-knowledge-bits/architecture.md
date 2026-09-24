---
type: architecture
item: embed-knowledge-bits
stakes-tier: Guarded
---

# Architecture — embed-knowledge-bits

## Ownership boundary

`knowledge-bit-embedding.repo.ts` and `knowledge-bit-embedding.orchestrator.ts` live under
`apps/api/src/knowledge-bit/` and own the embedding write path for `knowledge_bits` exclusively.
They do not touch `facts`, `topic_card_variants`, or their orchestrators — this is a new, parallel
instance of the same pattern, not a shared generic embedding-scan abstraction. No existing file
outside the knowledge-bit module is modified except the three router/server registration points for
the new trigger route.

## Non-goals (explicit)

- **No retrieval wiring.** `cards-retrieval.orchestrator.ts`'s `Candidate` union is not extended.
  Knowledge bits are write-only-embedded by this item; becoming retrievable is separate scope.
- **No pgvector.** Matches every existing embedded table's convention (`jsonb` + in-app cosine
  similarity). Introducing a vector column type is a larger, separately-reviewed architectural
  change affecting the whole embedding pipeline, not this one table.
- **No claim/lock mechanism for the scan.** Concurrent scan calls may both pick up the same
  unembedded row and both write. Accepted, matching `facts-embedding.orchestrator.ts`'s and
  `cards-embedding.orchestrator.ts`'s existing behavior: writes are idempotent (same final state
  either way), the hash check stops a third redundant call, and the batch cap bounds paid-call cost.

## Rollback

Fully additive — three nullable columns, two new files, one new route registration. Revert by
dropping the migration (or leaving the unused nullable columns) and removing the route entries in
`router-table.ts`/`router.ts`/`server.ts`. No existing behavior or data is changed by this item.
