---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Separate progress overlay from structure — show mastery on top of static map (issue #85)"
state: open
updated: 2026-08-09
---
# Todo: Separate progress overlay from structure

## Decisions to make
None — every open question during planning had a safe default and was resolved without needing a
person's decision.

## To review / clarify
None.

## Manual steps
None — no manual setup, migrations, or production-only actions are needed for this change.

This work depends on the related domain-node mapping changes being finished first, and must be
built on top of them rather than from a clean starting point.

## Post-deploy checks
- [ ] Once any subject has real topics with no courses mapped to them, confirm the gap indicator
  looks visually distinct from the other status badges in a real browser.

## Coding tasks
- [x] Calculate whether a topic area has any coverage gaps
- [x] Make that calculation available to the rest of the app
- [x] Show a gap indicator in the map view
- [x] Test the gap indicator display
- [x] Add a regression test covering the full map structure
- [x] Verify all tests pass and the code type-checks
- [x] Confirm the gap indicator and existing controls work together in a live walkthrough

## Follow-on candidates (not this ticket)
- Distinguish topics never studied from topics studied but with zero mastery, if that distinction
  becomes useful.
- Add a way to jump straight to gaps across a subject, if browsing topic by topic proves too slow.
- Show parent topics whether any of their subtopics have gaps, if hiding that turns out to be
  confusing.

## Notes
- Historical build record kept in build-log.md.
