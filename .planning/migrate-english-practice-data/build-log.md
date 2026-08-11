# Migrate English practice data build log

## Resolved

- 2026-08-04: phraseBankAppearances.phraseId reclassified safe-default — confirmed write-only, never read back.
- 2026-08-04: grill-plan-ie found 4 gaps (live-entry text collision, stale index.json, cross-file id collision, sequence-read ordering) — all fixed.
- 2026-08-04: advisor found 3 gaps (due-schedule off-by-one, status clause order, scripts/ vs src/ vitest glob) — all fixed.
- 2026-08-04: advisor found 2 more gaps (isAdjacent mastery-suppression bug, mastered-import dedupe drop) — all fixed.
- 2026-08-04: Build complete against fixture data (no live source credentials available — see Manual
  steps below). All coding tasks done; `npx tsc --noEmit` clean; dry-run proof (12/12/6/9 rows,
  zero writes, unchanged row counts) and integration test (11/11 passing, covering DoD items a-g
  including the isAdjacent and mastered-collision fixes above) both verified against a locally
  seeded source-shaped Postgres. Live run against the real source Neon database is still blocked on
  `SOURCE_DATABASE_URL` per Manual steps.
