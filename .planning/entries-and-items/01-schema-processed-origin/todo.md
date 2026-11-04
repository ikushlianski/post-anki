---
type: todo
branch: learn-from-doc-site
task: Schema for processed entries and manual knowledge items
state: open
updated: 2026-10-11
---
# Todo: Schema for processed entries and manual knowledge items
## Decisions to make
Nothing to decide.
## To review / clarify
Nothing to clarify.
## Coding tasks
- [x] Add shared origin schema and test
- [x] Add processed_at and origin to the schema and generate migration 0096 with the report view replacement
- [x] Skip feedback writes for manual items and refuse their grades
- [x] Exclude manual items from by-model counts, model evidence, reviewer memory and the report view
- [x] Add mark processed and reopen routes with tests
- [x] Carry processedAt and origin in the pending-review payload and pin the sidebar count rule (count ignores items of processed entries)
- [x] Update review-feedback and domain-vocabulary docs
## Manual steps
- Coordinator backs up the local Docker DB (5562) and applies migration 0096 with the existing migrate script.
## Post-deploy checks
- Existing entries show no processed time and existing items show origin extracted after the migration.
## Resolved
None yet.
