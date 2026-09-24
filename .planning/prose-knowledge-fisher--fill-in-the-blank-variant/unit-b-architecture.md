# Architecture notes — fill-blank retry-and-claim concurrency (Unit B)

## Non-goals
- No distributed lock service, no job queue — a plain claim-timestamp column on the existing row is
  enough at this scale (capped 50-row batch scans).
- No change to the `wh_question` generation pipeline in this unit — it has the same underlying bug
  (logged separately under `data-integrity-under-regeneration`), out of scope here.
- No backoff/exponential-delay scheduling between retry attempts — the attempts cap alone is the
  guard against an infinite retry loop; time-based backoff is a future refinement if it's ever
  needed.

## Rollback
Purely additive: two new nullable/defaulted columns, no data migration, no destructive change to
existing rows. Reverting the migration (drop both columns) and the code together is a clean,
one-step rollback — no backfill or cleanup required either direction.
