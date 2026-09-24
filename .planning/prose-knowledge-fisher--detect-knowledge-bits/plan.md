# Auto-detect distinct knowledge bits inside a block of prose

## Goal
Given a `knowledge_sources` row (pasted prose or a Notion page, `status: "pending"`), split its
`rawText` into distinct, self-contained "knowledge bits" via an LLM call, and store each bit as its
own row — ready for later items (tag, embed, place into the hierarchy) to pick up independently.

## Why not reuse `facts` directly
Checked every read site of `facts` first (per CLAUDE.md's grep-before-design rule). Two of them —
`cards-retrieval.orchestrator.ts:43-60` and `facts-embedding.orchestrator.ts` via
`listFactsForEmbeddingScan()`/`listEmbeddedFacts()` — scan or surface **every** fact with no
`topicId`/`source` filter, including nulls (`notion-sync.repo.ts:insertFact` already inserts with a
null `topicId`, and those rows are shown to the learner as search results). Inserting raw,
untagged, unplaced bits into `facts` would surface half-processed content to the learner before
tagging/placement ever runs. A separate `knowledge_bits` table avoids that leak; a later item
("Place each knowledge bit into the existing subject, curriculum, and topic it fits") is what
promotes a bit into a real `facts` row, once it actually has a topic.

## Design

### Schema
- `knowledgeSources` gains `failureReason` (text, nullable) — set when bit-detection fails on a
  source, so a row never sits in `processing` forever with no explanation.
- New table `knowledgeBits`:
  - `id` (text, PK)
  - `knowledgeSourceId` (text, not null) — no FK, matches this schema's existing convention
    (`facts.topicId`, `facts.sourceRef` are also unenforced references)
  - `ordinal` (integer, not null) — the bit's position within its source
  - `body` (text, not null) — the bit's text
  - `createdAt` (timestamp with tz, not null, default now)
  - unique index on `(knowledgeSourceId, ordinal)` — the idempotency key: re-running detection on
    the same source can never insert the same bit twice

### Pipeline (a batch scan, never inline in the ingest POST)
`accept-notion-source`'s review found that doing expensive work inline in a POST handler lets one
call queue unbounded downstream cost. Bit-detection reuses that lesson: it's a separate scan step,
triggered by its own endpoint, never run as part of `POST /knowledge-sources` or
`POST /knowledge-sources/notion`.

`POST /knowledge-sources/detect-bits` (no body):
1. Select up to `DETECT_BITS_BATCH_CAP = 20` rows from `knowledge_sources WHERE status = 'pending'`
   (ids only).
2. For each id, atomically claim it: `UPDATE knowledge_sources SET status = 'processing' WHERE id =
   $1 AND status = 'pending' RETURNING *`. Zero rows back (another run already claimed it) → skip,
   don't error.
3. **Input bound before the LLM call**: if `rawText.length > MAX_SOURCE_CHARS` (50,000 — roughly a
   short book chapter, well above any real pasted note), mark `status: 'failed'`,
   `failureReason: 'source_too_long'`, skip the LLM call entirely. An uncapped pasted book must
   never turn into an uncapped LLM bill.
4. LLM call (cheap tier, reusing `resolveModelTier`/biz-education's `structuredOutput` + Zod
   pattern): wraps `rawText` in `<source>...</source>` delimiters (same injection-guard shape as
   biz-education's `<note>` prompt) with an explicit instruction that only tokens inside the
   delimiters are content to extract from — nothing inside them is ever an instruction to follow.
   Output schema: `{ bits: z.array(z.string().min(1)).min(1).max(20) }` — `.min()`/`.max()`, not
   `.optional()`, to keep OpenRouter strict mode happy (per this repo's own OpenRouter/structured-
   output memory).
5. On a successful call: insert each bit (`ordinal` = its index in the array) via
   `insertKnowledgeBits(sourceId, bits)`, using `onConflictDoNothing` on `(knowledgeSourceId,
   ordinal)`. Set `status: 'bits_detected'`.
6. On a provider error (the LLM call itself throws — rate limit, timeout, malformed structured
   output): set `status: 'failed'`, `failureReason: '<short reason>'`. Never swallow the error
   silently and never leave the row stuck in `processing`.
7. Return `{ processed: number, detected: number, failed: number }` — counts, not the full row/bit
   list.

### Model tier
`cheap` (`openrouter/deepseek/deepseek-v4-flash-latest`), same tier as biz-education's classifier —
this is a classification/extraction call, not question-generation (which stays on a fuller-
capability tier per this direction's own Notes).

## Files to touch
- `apps/api/src/db/schema.ts` — `knowledgeSources.failureReason`, new `knowledgeBits` table
- `apps/api/src/db/migrations/` — new migration
- `apps/api/src/knowledge-bit/knowledge-bit.repo.ts` — new: `insertKnowledgeBits`,
  `claimPendingKnowledgeSources`, `markKnowledgeSourceFailed`, `markKnowledgeSourceBitsDetected`
- `apps/api/src/mastra/knowledge-bit-detector.agent.ts` — new: the LLM call + Zod schema, mirrors
  `biz-education-classifier.agent.ts`'s shape
- `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts` — new: the scan loop (Steps
  1-7 above)
- `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts` — new: `POST
  /knowledge-sources/detect-bits`
- `apps/api/src/router-table.ts`, `router.ts`, `server.ts` — wire the new route
- `apps/api/src/knowledge-source/knowledge-source.controller.ts` — add `.max(50_000)` to the
  pasted-prose `text` field, so the same input-bound the scan enforces also stops an oversized
  paste from being accepted in the first place (defense in depth, not the only enforcement point)
- Unit tests co-located; migration shape + idempotent-insert + atomic-claim proved against real
  Postgres in `apps/api/src/db/migrations.integration.test.ts`

## Non-goals
- No tagging, embedding, or hierarchy placement of the detected bits — later items
- No UI trigger for the scan endpoint — backend only
- No automatic/cron scheduling of the scan — manually triggered via the endpoint, same as the
  existing facts-embedding scan endpoint

## Rollback
Additive: one nullable column, one new table, one new route, four new files. No existing table,
route, or the biz-education/notion-sync pipelines' own files are touched (the one edit to
`knowledge-source.controller.ts` is a strictly-narrowing input validation, not a behavior change
for any currently-valid request).
