---
type: todo
branch: migrate-english-practice-data
task: Migrate existing English practice data from english-advanced into post-anki
state: open
updated: 2026-08-09
---
# Todo: Migrate existing English practice data into post-anki

## Decisions to make

- [ ] Confirm how an imported entry's learning status should be determined
- [ ] Confirm which difficulty level imported phrases should be assigned
- [ ] Confirm the default review scheduling for newly imported entries

## To review / clarify

Nothing to review.

## Coding tasks

- [x] Determine whether an imported entry is active, struggling, or new
- [x] Reorder imported entries into a consistent review schedule
- [x] Assign each imported entry a position based on when it was created
- [x] Generate a unique identifier for each imported entry
- [x] Read the existing practice data and check for naming conflicts
- [x] Read from the old data source and write it into the new system safely
- [x] Run the whole migration as one safe, reversible operation with a preview option
- [x] Provide a command to trigger the migration
- [x] Prove the migration can be safely run more than once
- [x] Make the migration runnable as a standard command
- [x] Update the documentation describing what this feature covers

## Manual steps

- [ ] Provide access credentials for the original data source
- [ ] Confirm the migration will write into the real production database, not a copy
- [ ] Confirm the source data files can still be found when the migration runs
- [ ] Preview the migration first and check the counts against the real source data
- [ ] After migrating, confirm the imported data actually appears in the app

## Post-deploy checks

No post-deploy checks needed.

## Notes

- Historical build record kept in build-log.md.
