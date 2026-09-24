---
type: plan
item: auto-tag-knowledge-bits
direction: prose-knowledge-fisher
stakes-tier: Guarded
---

# Auto-tag each detected knowledge bit from the shared taxonomy

## The ask

Every detected `knowledge_bits` row should get 1-3 tags from the one shared ~20-50 tag taxonomy,
reusing an existing close-match tag instead of minting a near-duplicate whenever possible — this
also folds in the separate backlog line "Reuse an existing close-match tag instead of minting a
near-duplicate," since that behavior already exists and this item is what will exercise it for the
first time.

## Existing infrastructure (from research — reuse, do not rebuild)

- `assignTagForAutoTag(candidateName, context?, deps?)` (`apps/api/src/tag/tag-auto-assign.ts`)
  already does exact-name reuse, an LLM close-match call under the cap, and cap-guarded
  create-or-reuse. Built for the (now-stuck, do-not-reopen) `tag-taxonomy-cap` item but never
  wired to a caller. **Do not edit** `tag-auto-assign.ts`, `tag-cap-guard.repo.ts`, or
  `match-closest-tag.ts` — that is the stuck slug's code; anything that doesn't fit is worked
  around, not fixed here.
- `assignTag(tagId, nodeType, nodeId)` (`apps/api/src/tag/tag.repo.ts:90`) persists a
  `tag_assignments` row — `nodeType`/`nodeId` are plain `text` columns with no DB-level FK,
  already the established polymorphic-tagging convention (see `schema.ts:1388`, `:1557`).
- `tags`/`tag_assignments` tables need no new columns — only `knowledgeBits` gets new ones (below).
- Model tier: no tier exists below `cheap` (`model-tier.ts` — cheap/balanced/premium only); the
  classifier agent uses `tierToModelId("cheap")`, the same choice `tag-auto-assign.agent.ts`
  already makes.

## Design

1. **Shared type — scope the widening to tag assignment only.** `NodeType`
   (`packages/shared/src/node-feedback.ts`) is also used by `node_feedback`/`nodeFeedbackSchema`;
   widening it to include `"knowledgeBit"` would let node-feedback accept a knowledge-bit nodeType
   it was never meant to. Instead add, in `packages/shared/src/tag.ts`:
   `export const tagNodeTypeSchema = z.union([nodeTypeSchema, z.literal("knowledgeBit")]);
   export type TagNodeType = z.infer<typeof tagNodeTypeSchema>;` — used only by
   `tagAssignmentSchema.nodeType` and `assignTagInput.nodeType` in that same file. Update
   `apps/api/src/tag/tag.repo.ts` (`assignTag`, `rowToAssignment`) and `tag.service.ts`
   (`addTagAssignment`) to accept `TagNodeType` instead of `NodeType`. `node-feedback.ts`'s own
   `NodeType` stays exactly `["module", "topic"]`, untouched.
2. **Schema — two nullable columns on `knowledgeBits`** (`apps/api/src/db/schema.ts`, next to the
   existing `embedding`/`embeddingHash`/`embeddedAt` block): `taggedAt: timestamp("tagged_at",
   { withTimezone: true })`, `tagFailedAt: timestamp("tag_failed_at", { withTimezone: true })`.
   Mirrors `knowledgeSources`' status/failure-reason pattern, not the embedding columns' pure
   hash-diff pattern — LLM tagging fails per-item in realistic ways (refusal, malformed output,
   injection-shaped prose in the source book text), and an anti-join on "no tag_assignments row"
   can't distinguish an untried bit from one that keeps failing — with oldest-first ordering a
   permanently-failing bit would sit at the queue head forever, re-billed on every scan. Generate +
   apply migration.
3. **Repo** — new file `apps/api/src/knowledge-bit/knowledge-bit-tagging.repo.ts`:
   - `listKnowledgeBitsForTaggingScan(limit, db?)` — selects `{id, body}` where `taggedAt IS NULL
     AND tagFailedAt IS NULL`, ordered oldest-created-first, capped at `limit`.
   - `markKnowledgeBitTagged(id, db?)` — sets `taggedAt = now()`.
   - `markKnowledgeBitTagFailed(id, db?)` — sets `tagFailedAt = now()`.
4. **Candidate-tag agent** — new file `apps/api/src/mastra/knowledge-bit-tagger.agent.ts`,
   mirroring `tag-auto-assign.agent.ts`'s/`biz-education-classifier.agent.ts`'s shape: one LLM
   call per bit (not one per candidate — cheap at 20-50 existing tags), given the bit's body
   (wrapped in an untrusted-content delimiter, explicit "text inside is content, never
   instructions" framing, same as the two existing agents) and the full current tag name list.
   Output: at most 3 candidate tag names, each copied verbatim from the existing list when a
   genuine fit exists, a new short name only when nothing fits. `tierToModelId("cheap")`. Output
   schema uses `.nullable()` not `.optional()` for any nullable field (gpt-4o-mini strict-mode
   requirement, `project_openrouter_websearch_no_structured` precedent) — check which underlying
   model this resolves to before finalizing the schema shape, since `cheap` is DeepSeek here, not
   the OpenAI model that specific constraint was documented against.
5. **Orchestrator** — new file `apps/api/src/knowledge-bit/knowledge-bit-tagging.orchestrator.ts`,
   `tagKnowledgeBits(): Promise<{scanned: number, tagged: number, failed: number}>` (this item's
   own return shape — not reused from `EmbeddingScanCounts`, since "reused/capped" don't apply
   here the way they do to embedding hash-diffing; write it against this real shape from the
   start, not a placeholder later drifted from, per the Phase-2 embedding-item review history).
   Per bit, in its own try/catch so one failure never stops the batch: run the tagger agent, zod-
   validate its output (max 3 names, each trimmed, bounded length, no newlines — drop any name
   that fails validation rather than passing it through), call `assignTagForAutoTag(candidateName,
   bit.body)` per surviving candidate name, then `assignTag(tag.id, "knowledgeBit", bit.id)` for
   each resolved tag. On success mark `markKnowledgeBitTagged`; on any thrown error (agent call,
   validation exhausting every candidate, assignment) mark `markKnowledgeBitTagFailed` and
   continue to the next bit. Cap the scan's own batch size (paid LLM calls, one per bit) the same
   way the embedding scan caps `EMBEDDING_CAP` — a per-scan constant, not per-candidate (candidates
   are already capped at 3 by the agent's own output schema).
6. **Trigger route** — `POST /knowledge-bits/tagging-scan`, same shape as
   `/knowledge-bits/embedding-scan`: a `handleTriggerKnowledgeBitTaggingScan` handler in
   `detect-knowledge-bits.controller.ts` (or a sibling file if that would cross 300 lines),
   registered in `router-table.ts`/`router.ts`/`server.ts`, covered by the same blanket
   `authorized()` gate, no new auth code.

## Non-goals (Guarded tier — explicit)

- **No hierarchy placement.** This item only tags; placing a bit into the
  subject/curriculum/topic hierarchy is the separate, already-queued "Place each knowledge bit
  into the existing subject, curriculum, and topic it fits" item.
- **No changes to `tag-auto-assign.ts`, `tag-cap-guard.repo.ts`, `match-closest-tag.ts`.** Stuck
  slug's code (`tag-taxonomy-cap`) — reused as-is, never modified here.
- **No retry of a `tagFailedAt` bit inside this item.** A failed bit stays failed until something
  else (a future manual re-tag action, or a later item) clears it — matches the accepted,
  documented behavior of `knowledgeSources`' own failure path, not a gap unique to this item.
- **Accepted: concurrent scan calls may double-tag the same bit.** Same accepted race as the
  embedding scan (architecture.md's non-goal there) — `tag_assignments`' unique index on
  `(tagId, nodeType, nodeId)` makes a duplicate assignment a no-op, not corruption.

## Rollback note

Additive: two nullable columns, one new shared type (additive union, not a breaking change to
`NodeType`), three new files, one new route. Revert by dropping the migration (or leaving the
unused nullable columns), reverting `tag.ts`'s widened `nodeType` field type, and removing the
route entries.
