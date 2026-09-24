---
type: plan
item: embed-knowledge-bits
direction: prose-knowledge-fisher
stakes-tier: Guarded
---

# Embed each submitted knowledge bit into the existing vector pipeline

## The ask

Every detected `knowledge_bits` row should get embedded the same way `facts` and
`topic_card_variants` already do, so it's ready for future retrieval work — same conventions, same
batch-scan shape, no new infrastructure.

## Existing convention (from research)

- `facts`/`topic_card_variants` store embeddings as a plain `jsonb` `number[]` column — **no
  pgvector**, no vector extension anywhere in this repo.
- Each also carries `embeddingHash` (text) and `embeddedAt` (timestamp), both nullable. Presence/
  absence + hash mismatch against the row's current content *is* the pending/stale/done signal —
  no separate status enum like `knowledge_sources.status`.
- A batch-scan orchestrator (`facts-embedding.orchestrator.ts`, `cards-embedding.orchestrator.ts`)
  lists candidate rows, hashes current content in-app (`hashContent` from `@post-anki/core`),
  skips rows whose hash still matches, caps the paid-call batch (existing precedent:
  `EMBEDDING_CAP = 200`), calls `embedTexts` once per batch, writes each result back.
- Trigger is a plain authenticated HTTP route (`POST /cards/embedding-scan` →
  `handleTriggerCardEmbeddingScan` → `router-table.ts`/`server.ts` dispatch), gated by the
  server's existing blanket `authorized()` check — no scan-specific auth, no cron.

## Design

1. **Schema** — add to `knowledgeBits` (`apps/api/src/db/schema.ts`): `embedding: jsonb("embedding")
   .$type<number[]>()`, `embeddingHash: text("embedding_hash")`, `embeddedAt: timestamp("embedded_at",
   { withTimezone: true })` — all nullable, additive, no backfill. Generate + apply migration.
2. **Repo** — new file `apps/api/src/knowledge-bit/knowledge-bit-embedding.repo.ts` (kept separate
   from `knowledge-bit.repo.ts` to stay under the 300-line cap):
   - `listKnowledgeBitsForEmbeddingScan(limit, db?)` — selects `{id, body, embeddingHash}` for bits
     with `embeddedAt IS NULL`, ordered oldest-created-first, capped at `limit`. Hash-mismatch
     filtering happens in the orchestrator (same as the existing precedent), not in SQL, since the
     hash must be computed in-app from the current `body`.
   - `updateKnowledgeBitEmbedding(id, embedding, embeddingHash, db?)` — single UPDATE setting all
     three columns together.
3. **Orchestrator** — new file `apps/api/src/knowledge-bit/knowledge-bit-embedding.orchestrator.ts`,
   `embedKnowledgeBits(deps?): Promise<{scanned, embedded, skipped}>` mirroring
   `facts-embedding.orchestrator.ts`'s shape: list candidates, compute each one's current hash,
   drop any whose stored hash still matches (nothing changed since last embed — this only matters
   for a future re-embed path since a first-time bit always has `embeddingHash: null`), cap the
   paid-call batch, call `embedTexts` once, write results back one at a time.
4. **Trigger route** — dedicated route (not piggybacked on `/cards/embedding-scan`, since knowledge
   bits are a separate module with their own ownership boundary): `POST
   /knowledge-bits/embedding-scan` → a new `handleTriggerKnowledgeBitEmbeddingScan` in
   `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts` (or a new controller file if
   that one would cross 300 lines), registered in `router-table.ts`/`router.ts`/`server.ts` exactly
   like the cards route. Covered by the same blanket `authorized()` gate — no new auth code needed.

## Non-goals (Guarded tier — explicit)

- **No retrieval wiring.** `findTopMatchingCards`'s `Candidate` union
  (`apps/api/src/cards/cards-retrieval.orchestrator.ts`) is not extended to include knowledge bits.
  This item is write-only: embed and store. Making knowledge bits retrievable is separate, future
  scope — extending an existing consumer's return shape is a bigger, differently-reviewed change.
- **No pgvector migration.** Matches the repo's existing convention; introducing a vector column
  type would be a separate, much larger architectural change affecting every embedded table, not
  scoped to this item.
- **Accepted: concurrent scan calls may double-embed the same row.** Two overlapping
  `POST /knowledge-bits/embedding-scan` calls could both select the same unembedded row before
  either writes back. This is accepted, not fixed here — writes are idempotent (last write wins,
  same final state), the hash check prevents a *third* wasted call once one write lands, the paid
  call is capped, and `facts-embedding.orchestrator.ts`/`cards-embedding.orchestrator.ts` already
  accept the same race for the exact same reasons. Do not add a claim/lock mechanism here — that
  would be new complexity beyond this item's precedent-following scope.

## Rollback note

Entirely additive: three new nullable columns on an existing table, two new files, one new route.
Reverting is a single migration dropping the three columns (or leaving them — they default to
`NULL` and nothing else reads them) plus removing the route registration. No data migration, no
existing behavior changed.
