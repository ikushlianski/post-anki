---
type: todo
branch: learn-from-doc-site
task: F-learn — minute-level learning steps (item 11)
state: open
updated: 2026-10-10
---
# Todo: F-learn — minute-level learning steps
## Decisions to make
Nothing to decide.
## To review / clarify
- [ ] Confirm F-queue's interval formatter rounds 330 seconds to "6m"; extend it only if not
- [ ] Generate this migration only after 13-session-controls' migration is merged, or before it starts, never in parallel
## Coding tasks
None open.
## Manual steps
- [ ] Apply migration locally with DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/post_anki_dev
- [ ] Run a local sitting: fail a new card, wait out 1m and 10m steps, fail a review card
## Post-deploy checks
- [ ] Confirm existing production schedules read as review with zero lapses
## Resolved
None yet.
