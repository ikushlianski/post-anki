---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Visual knowledge map — graph/mind-map rendering of objective taxonomy with mastery overlay (issue #86)"
state: implemented
updated: 2026-08-09
---
# Todo: Visual knowledge map

## Decisions to make
Two open questions were flagged for a person to decide, each with a recommended default already
chosen:
1. What visual style the knowledge map should use.
2. Whether the map replaces or sits alongside the existing list view.

## To review / clarify
None.

## Manual steps
None — no manual setup or production-only actions are needed. Two new libraries install
automatically at build time.

This work depends on two related pieces of work being finished first, and must be built on top of
them rather than from a clean starting point.

## Post-deploy checks
- [ ] Once real topic data exists, confirm the map's default zoomed-out view actually feels like a
  useful overview.

## Coding tasks
- [x] Calculate how to lay out the knowledge map and which topics start collapsed
- [x] Make that layout logic available to the rest of the app
- [x] Choose colors that represent mastery level, including having no progress yet
- [x] Design the visual card representing each topic on the map
- [x] Design the connecting lines between topics, including a highlighted state
- [x] Build a details panel that appears when a topic is selected
- [x] Build the interactive map view and the state it depends on
- [x] Add the map as a new way to view a subject's topics
- [x] Add a toggle to switch between list and map views
- [x] Test every new part of this feature
- [x] Add the graphing and layout libraries needed to draw the map
- [x] Verify all tests pass and the code type-checks
- [x] Confirm the map works end-to-end in a live walkthrough on a phone-sized screen

## Follow-on candidates (not this ticket)
- Remember the learner's preferred view, if switching back and forth every visit becomes annoying.
- Let learners take actions directly from the map view, if switching to the list view first proves
  too slow.
- Add real prerequisite or cross-link relationships between topics, if that turns out to matter
  later.
- Reconsider the map's visual style if it reads poorly once there are many more topics to show.

## Notes
- Historical build record kept in build-log.md.
