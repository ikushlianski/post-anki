# Architecture: tag-assignment provenance

## Non-goals
- Not a general-purpose audit trail for `tag_assignments` (no who/when beyond the existing
  `created_at`) — `source` is a two-value provenance flag, nothing richer.
- Not a retroactive backfill of real historical provenance — no source data exists to derive it
  from; every pre-migration row becomes `"manual"` by default, permanently.
- Not a change to how tags are matched/resolved (`match-closest-tag.ts`) or created
  (`resolveOrCreateTag`) — only assignment provenance and the edit-time cleanup it gates.
- Not a UI-visible feature in this unit — no badge, no filter, no display change.

## Rollback
Single additive column, no data migrated out of existing columns, no existing row deleted. Rollback
is `ALTER TABLE tag_assignments DROP COLUMN source` via a follow-up drizzle-kit migration (or, pre-
deploy, simply reverting this branch) — every write path that references `source` reverts along
with it, and `updateKnowledgeBitBody`'s delete reverts to its prior unscoped `DELETE ... WHERE
node_type = 'knowledgeBit' AND node_id = id` behavior. No irreversible state is created by this
change.

## Files touched (by scenario, from plan.md)
| File | Change |
|---|---|
| `apps/api/src/db/schema.ts` | Add `source` column (`text`, not null, default `'manual'`) to `tagAssignments` |
| new migration (`apps/api/src/db/migrations/`, `db:generate`) | Adds the column, backfills existing rows to `'manual'` via the column default |
| `apps/api/src/tag/tag.repo.ts` | `assignTag`'s manual insert path — upsert with `source: 'manual'`, upgrade on conflict |
| `apps/api/src/knowledge-bit/knowledge-bit-tagging.repo.ts` | New `assignAutoTag` (or equivalent) used inside `assignTagsAndMarkTagged` — insert `source: 'auto'`, do-nothing on conflict |
| `apps/api/src/knowledge-bit/knowledge-bit.repo.ts` | `updateKnowledgeBitBody`'s tag delete scoped to `source = 'auto'` |
| `apps/api/src/tag/tag-merge.repo.ts` | Pre-dedupe upgrade `UPDATE` for a manual source-side assignment |
