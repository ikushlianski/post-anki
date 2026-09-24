---
type: architecture
item: review-placement-suggestions
---

# Architecture

## Non-goals (restated from plan.md, explicit for Guarded tier)

- No automatic module/curriculum creation — admin picks an existing module only.
- No automatic retry of the placer agent on reject — a rejected bit is terminally unplaced.
- No bulk accept/reject — one suggestion resolved per call.

## Rollback note

Additive only: one nullable timestamp column (no FK, no backfill needed), two new repo functions
inside the existing `knowledge-bit-placement.repo.ts`, two new routes, one new frontend panel file
plus its API client. Revert by dropping the migration, removing the two route entries, and removing
the panel's mount point from the admin-settings page — nothing else depends on this item's output.
