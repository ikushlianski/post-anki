# Plan: distinguish auto-tagged from manually-tagged assignments

## Goal
Stop `PATCH /knowledge-bits/:id` from deleting a human curator's manually-assigned tags when it
resets a bit's auto-derived state — without losing the existing "clear stale auto-tags on edit"
behavior for tags the auto-tagger itself produced.

## Root cause
`tag_assignments` (`apps/api/src/db/schema.ts:802-818`) has no column distinguishing an
auto-tagger-written row from a human curator's manual `POST /tags/:id/assignments` row — both go
through the same `assignTag` insert (`apps/api/src/tag/tag.repo.ts:101-134`). `tagNodeTypeSchema`
(`packages/shared/src/tag.ts:4`) confirms `knowledgeBit` is a reachable manual-assignment target.
`updateKnowledgeBitBody`'s tag-reset (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts:190-192`)
deletes every row for the bit, auto and manual alike.

## Design
Add a `source` provenance column: `"auto" | "manual"`.

- **Migration**: `source` text column on `tag_assignments`, `NOT NULL DEFAULT 'manual'`. Existing
  rows have no recorded provenance — defaulting to `"manual"` is the safe direction (never silently
  delete a row we don't have direct evidence was auto-derived on some future edit). Accepted
  tradeoff: any genuinely-auto-derived legacy row (assigned before this migration) is now
  mis-classified as manual and will survive an edit it should have been cleared by — logged as a
  known, permanent, one-time cost, not a bug to chase further.
- **Manual path** (`assignTag`, `apps/api/src/tag/tag.repo.ts:101-134`, called from
  `POST /tags/:id/assignments`): insert with `source: "manual"`. On conflict with an existing row
  (`ON CONFLICT (tag_id, node_type, node_id) DO UPDATE SET source = 'manual'`) — a curator manually
  confirming an auto-tag upgrades it to manual, permanently protecting it from a future edit's
  auto-tag cleanup. Never downgrades (this path only ever sets `"manual"`).
- **Auto path** (new `assignAutoTag`, used inside `assignTagsAndMarkTagged`'s row-locked
  transaction, `apps/api/src/knowledge-bit/knowledge-bit-tagging.repo.ts:47-74`): insert with
  `source: "auto"`, `ON CONFLICT (tag_id, node_type, node_id) DO NOTHING` — never touches an
  existing row's `source`, so a manually-upgraded row is never downgraded back to auto, and a
  pre-existing auto row is left alone (idempotent re-tagging).
- **Edit-time reset** (`updateKnowledgeBitBody`, `apps/api/src/knowledge-bit/knowledge-bit.repo.ts:190-192`):
  delete only scoped to `source = 'auto'` — manual assignments survive an edit untouched.
- **Tag merge** (`apps/api/src/tag/tag-merge.repo.ts:31-37`): the pre-existing "dedupe" delete drops
  the source tag's duplicate row for a node that already carries the target tag, keeping whichever
  target row already existed. Add one `UPDATE tag_assignments SET source = 'manual' WHERE tag_id =
  targetId AND (node_type, node_id) IN (SELECT node_type, node_id FROM tag_assignments WHERE
  tag_id = sourceId AND source = 'manual')`, run immediately before the dedupe delete — so a
  manual source-side assignment upgrades the surviving target-side row instead of being silently
  lost. The non-colliding "moved" `UPDATE ... SET tag_id` step already carries each row's own
  `source` forward untouched — no change needed there.

## Out of scope
- No backfill attempt to recover real historical provenance for pre-migration rows — no signal
  exists to derive it from.
- No UI surfacing of a tag's provenance (e.g. an "auto-tagged" badge) — purely a backend
  data-integrity fix.
- No change to `assignTag`'s existing "return existing row untouched" early-return shape beyond
  adding the upgrade-on-conflict behavior described above.
