# Impl report 2: skipped-item tests for subject and source duplicate scans

Files added (tests only, no production changes):
- apps/api/src/source-duplicate/source-duplicate.orchestrator.test.ts (2 tests)
- apps/api/src/subject-duplicate/subject-duplicate.orchestrator.skipped-items.test.ts (2 tests)

Deviation: the existing subject-duplicate.orchestrator.test.ts is a real-Postgres test excluded from the default vitest config, not a mocked unit test. Extending it would need a database, so the subject cases went into a new mocked co-located file instead; the existing file is untouched.

Coverage per scan: fewer results than sent gives embeddedCount equal to the saved number, skippedCount equal to the difference, and only saved rows written back; full save leaves skippedCount absent.

Run: `npx vitest run src/subject-duplicate src/source-duplicate/source-duplicate.orchestrator.test.ts` gave 2 files, 4 tests passed. The Postgres-backed subject files were not picked up by the directory filter because of the config exclude list.
tsc: `npx tsc --noEmit` in apps/api passed with zero errors (`-p apps/api` from the repo root fails because that path does not exist).
Bugs found: none.

END-OF-REPORT
