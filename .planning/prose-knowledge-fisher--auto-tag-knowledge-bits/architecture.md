---
type: architecture
item: auto-tag-knowledge-bits
stakes-tier: Guarded
---

# Architecture — auto-tag-knowledge-bits

## Ownership boundary

`knowledge-bit-tagging.repo.ts` and `knowledge-bit-tagging.orchestrator.ts` live under
`apps/api/src/knowledge-bit/` and own the tagging write path for `knowledge_bits` exclusively —
a new, parallel instance of the embedding-scan pattern (list, per-item work, cap, write back), not
a shared generic scan abstraction. `knowledge-bit-tagger.agent.ts` lives under `apps/api/src/
mastra/`, matching where every other classification/matching agent in this codebase already lives.

The only existing files touched: `packages/shared/src/tag.ts` (new `TagNodeType` union),
`apps/api/src/tag/tag.repo.ts` and `tag.service.ts` (widen the `nodeType` parameter type on
`assignTag`/`addTagAssignment` from `NodeType` to `TagNodeType`), `router-table.ts`/`router.ts`/
`server.ts` (the new route's three registration points), `schema.ts` (two new nullable columns on
`knowledgeBits`).

## Explicitly untouched

- `apps/api/src/tag/tag-auto-assign.ts`, `tag-cap-guard.repo.ts`, `match-closest-tag.ts` — the
  stuck `tag-taxonomy-cap` slug's code, reused via its existing public function
  (`assignTagForAutoTag`) exactly as it stands today.
- `packages/shared/src/node-feedback.ts`'s `NodeType`/`nodeTypeSchema` — stays `["module",
  "topic"]`. The new `TagNodeType` in `tag.ts` is a separate, additive union
  (`NodeType | "knowledgeBit"`) scoped only to tag-assignment schemas, so `node_feedback` never
  gains an ability to reference a knowledge bit it wasn't meant to.
- `apps/web/src/curriculum/model.ts`'s own `NodeType` — a separate definition, not imported from
  `@post-anki/shared`; no web UI surface exists yet for tagging a knowledge bit, so nothing there
  needs to change for this item.

## Non-goals (explicit)

- **No hierarchy placement.** Tagging and hierarchy placement are separate backlog items with
  separate designs — this item stops at `tag_assignments`.
- **No retry of a permanently-failed bit inside this item.** A `tagFailedAt` bit is excluded from
  future scans by the same selection query; clearing it is out of scope here.
- **Accepted: concurrent scans may attempt the same bit twice.** `tag_assignments`' existing
  unique index (`tagId`, `nodeType`, `nodeId`) makes a duplicate assignment attempt a no-op via
  `assignTag`'s own existing-row check — no new locking added, matching the embedding scan's
  accepted concurrency race for the same reasons (cap bounds cost, no corruption possible).

## Rollback

Additive: two new nullable columns, one new additive shared-type union (no existing type's
possible values are removed), three new files, one new route, two widened function-parameter
types (widening, not narrowing — nothing that already compiles against `NodeType` stops
compiling). Revert by dropping the migration, reverting the `TagNodeType` widening in `tag.ts`/
`tag.repo.ts`/`tag.service.ts`, and removing the route registration.
