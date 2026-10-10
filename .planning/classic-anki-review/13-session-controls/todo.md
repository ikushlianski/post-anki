---
type: todo
branch: learn-from-doc-site
task: F-session — in-session controls (items 13, 14, 16, 17, 18)
state: open
updated: 2026-10-10
---
# Todo: F-session — in-session controls
## Decisions to make
Nothing to decide.
## To review / clarify
- [ ] Confirm F-learning column names and lapse rule before building
- [ ] Confirm F-queue's new-card test accepts ungraded schedule rows
## Coding tasks
- [ ] Leech, undo and suspension derivers with unit tests
- [ ] Shared contracts: undo, schedule control, leech fields
- [ ] Schema columns, generate migration, apply to local lanes
- [ ] Schedule repo helpers and shared eligibility condition
- [ ] Grade orchestrator: ungraded rows count as new, leech auto-suspend
- [ ] Undo and suspension orchestrators with integration tests
- [ ] Apply eligibility condition to both queues and topic due counts
- [ ] Relax variant edit gate to not-rejected, update its tests
- [ ] Controller handlers, routes, router and route tests
- [ ] Web session reducer and stats derivers with tests
- [ ] Web keyboard actions, API server functions
- [ ] Web session bar, summary, card actions, editor, screen wiring
- [ ] Screen-level session tests, architecture doc, quality gates
## Manual steps
- [ ] Give one dev-lane bit seven lapses to try leech locally
## Post-deploy checks
- [ ] Confirm production undo, suspend and edit work on a real card
## Resolved
