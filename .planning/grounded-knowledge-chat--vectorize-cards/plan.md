# Vectorize every card's question/answer text, store the embedding

## What and why

The grounded-knowledge-chat direction needs every card variant (a question/answer pair)
vectorized so a later item can find the top-matching cards for a free-text query. The codebase
already has this exact pattern, twice: `subjects.embedding`/`embeddingHash` (jsonb + text columns)
and `apps/api/src/subject-duplicate/subject-duplicate.orchestrator.ts`'s scan shape — content-hash
based skip-if-unchanged, a capped batch embedding call, write the embedding+hash back onto the row.
`packages/core/src/subject-duplicate/select-scan-candidates.ts`'s `selectSubjectsForScan` is
already fully generic (`{id, contentHash, cachedHash}[]` in, `{toEmbed, reused, capped}` out) —
reused as-is, not reinvented. `apps/api/src/subject-duplicate/embeddings-client.ts`'s HTTP-call
core (batched OpenRouter `/embeddings` call, positional-index-safe, retried, timed out) gets
promoted to a shared, non-subject-specific location so this and any future embedding consumer call
the same tested code instead of a second copy.

This item is scoped to: schema + a batch-embed scan you can trigger, covering every existing card
variant. Automatic re-embedding the moment a card's text changes is a separate, later item —
deliberately not built here.

## Phases

### Phase 1: Add embedding columns to topic_card_variants, generate the migration
Goal: `topic_card_variants` has `embedding`/`embeddingHash`, matching the existing pattern exactly.
Key files: `apps/api/src/db/schema.ts` (add `embedding: jsonb("embedding").$type<number[]>()`,
`embeddingHash: text("embedding_hash")` to the `topicCardVariants` table definition), run
`npm run db:generate -w @post-anki/api` to produce the migration file, then
`npm run db:migrate -w @post-anki/api` against the local dev DB to confirm it applies cleanly.

### Phase 2: Promote the embeddings HTTP client to a shared, generic location
Goal: one tested embeddings-endpoint client, reused by subject-duplicate and cards alike.
Key files: new `apps/api/src/shared/embeddings-client.ts` — move `callEmbeddingsEndpoint`'s body
and a generic `embedTexts(items: {id: string; text: string}[]): Promise<{id: string; embedding:
number[]}[]>` here from `apps/api/src/subject-duplicate/embeddings-client.ts`. Turn
`embedSubjectTexts` into a thin wrapper calling `embedTexts` (same public signature, zero behavior
change — its own existing tests must still pass unmodified). Also add a generic `hashContent(text:
string): string` to `packages/core` (extract the existing `fnv1a32`-based hashing in
`packages/core/src/subject-duplicate/content-hash.ts` into a shared, non-subject-specific
function; `hashSubjectContent` becomes a thin wrapper over it, same public signature).

### Phase 3: A card-embedding scan orchestrator + repo functions + trigger endpoint
Goal: a callable operation that embeds every card variant needing it, capped per run, skipping
variants whose content hash hasn't changed.
Key files: `apps/api/src/cards/cards.repo.ts` (add `listCardVariantsForEmbeddingScan(): Promise<{id,
prompt, answer, embeddingHash}[]>` and `updateCardVariantEmbedding(variantId, embedding, hash):
Promise<void>`), new `apps/api/src/cards/cards-embedding.orchestrator.ts` (mirrors
`subject-duplicate.orchestrator.ts`'s shape: build content text as `` `${prompt}\n${answer}` ``,
hash it via the new shared `hashContent`, call `selectSubjectsForScan` — despite its subject-scoped
name, it's generic — for the capped-batch selection, call `embedTexts`, write results back; no
duplicate-pair-finding step, cards don't need dedup here), and a trigger — either a new endpoint
(`POST /cards/embedding-scan`, matching `subject-duplicate`'s own trigger-endpoint precedent) or a
cron-callable function if this codebase already has a cron-job convention (check
`apps/api/src/*/[a-z-]*-cron*.ts` or similar before deciding — use whichever precedent exists,
don't invent a third mechanism).

## Constraints and risks

- Reuses `selectSubjectsForScan` from `packages/core/src/subject-duplicate/` as-is (it's generic
  despite its folder). Do not copy/fork it into a `cards`-named duplicate — that would create two
  copies of identical logic to keep in sync.
- The embedding cap (mirror subject-duplicate's `EMBEDDING_CAP = 200`) bounds the paid embedding
  call only, per run — never silently drop a variant from ever being embedded; repeated scans must
  converge on full coverage, exactly like the subject-duplicate scan already guarantees.
- No retrieval logic in this phase — "find the top-matching cards for a query" is a separate,
  later item that reads these columns once they're populated.
