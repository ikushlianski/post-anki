---
type: architecture
item: wh-question-variant
stakes-tier: Guarded
---

# Architecture notes

## Non-goals (explicit)

- No fill-in-the-blank generation, no embedding of variants, no learner-facing serving/review flow,
  no admin UI, no changes to the tagging system or `biz-education-distiller/` — see plan.md's own
  Non-goals section for the full, authoritative list.
- No retry loop for failed generations — a `whQuestionGenerationFailedAt` bit stays terminal,
  exactly like `tagFailedAt`/`placementFailedAt` bits today. A human or a future backfill script
  can clear the timestamp to re-queue; this item doesn't build that mechanism.
- No new tag/taxonomy interaction — question variants are not tagged themselves in this item.

## Rollback note

Fully additive: one new table with no FK constraints (matches the existing no-FK convention on
`knowledgeBits`-adjacent tables — e.g. `knowledgeBits.topicId` also has no FK), two new nullable
timestamp columns on `knowledgeBits`. Revert path: drop the migration, delete the new agent/repo/
orchestrator/route files, remove the two new route-table/router/server entries. No existing table,
route, or agent is modified — every change is a pure addition, so a revert cannot break anything
that already works today.
