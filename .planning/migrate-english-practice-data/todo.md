---
type: todo
branch: migrate-english-practice-data
task: Migrate existing English practice data from english-advanced into post-anki
state: open
updated: 2026-08-04
---
# Todo: Migrate existing English practice data into post-anki

## Decisions to make

- [ ] Confirm active-entry status rule: isolation→struggling (checked first), else stage=0→new, else practicing.
- [ ] Confirm phrase-bank entries all land under source settings.level (only level signal available).
- [ ] Confirm due-next-batch default (=currentMaxSequence, lastCorrectAtSentenceCount always null).

## To review / clarify

Nothing to review.

## Coding tasks

- [x] `/tdd deriveActivePhraseBankStatus` — SCENARIO 2
- [x] `/tdd renumberActiveEntrySchedule` — SCENARIO 3
- [x] `/tdd assignSequenceNumbersByCreatedAt` — SCENARIO 1, SCENARIO 10
- [x] `buildImportId` helper, tested alongside above
- [x] `src/migrate-english-practice-data/*.source-json.ts` — reads active/mastered JSON, slug-collision check
- [x] `src/migrate-english-practice-data/*.repo.ts` — source reads, target writes, kind flip, live-entry collision check
- [x] `src/migrate-english-practice-data/*.orchestrator.ts` — runMigration, ordering, one transaction, --dry-run
- [x] `scripts/migrate-english-practice-data.ts` — thin CLI entry calling runMigration
- [x] `src/migrate-english-practice-data/*.integration.test.ts` — idempotency proof on local fixtures (under src/, not scripts/)
- [x] Wire `migrate:english-practice-data` npm script in apps/api/package.json
- [x] Update docs/architecture/phrase-bank-mastery.md Scope boundary section

## Manual steps

- [ ] Supply `SOURCE_DATABASE_URL` — the source app's own Neon connection string (same shape as its
      `.env.example`'s `DATABASE_URL`: `postgresql://user:password@host/dbname?sslmode=require`),
      pointing at `english-advanced`'s Neon instance. Not found anywhere in this build environment
      (checked process env, ~/.zshrc, ~/.zprofile, and the source repo itself — no `.env` file
      exists there, only `.env.example`). Required before any live (non-dry-run) run.
- [ ] Confirm target `DATABASE_URL` (post-anki's own) points at the real database before a live run,
      not a local/dev copy — unless a local-copy dry run is intentionally being exercised first.
- [ ] Confirm `SOURCE_LEARNING_DIR` (defaults to
      `/Users/ikushlianski/webdata/ilya-projects/english-advanced/learning`) still points at a
      readable `learning/` directory containing `active-phrases.json`/`mastered-phrases.json` at
      run time — the source repo may move before this script runs.
- [ ] Run `--dry-run` first and eyeball the printed summary against the JSON files' own actual entry
      counts — never `learning/index.json`, confirmed stale (says 6 active/8 total vs real 12/14).
- [ ] After a live run, verify the Phrase Bank panel and attempt history at `/practice/:subjectId`
      actually show the imported data before archiving the source repo/worktree (the wishlist item's
      own "done when" criterion).

## Post-deploy checks

No post-deploy checks needed.

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
