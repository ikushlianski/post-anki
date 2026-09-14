# Implement-factory-work backlog

## Coding tasks

- [x] Write topics.sourceId for docs-site topics (currently never set).
- [x] Fix depth-election race — gate opens before elected depths are written.
- [x] Surface go-deeper re-fetch failures instead of swallowing them silently.
- [x] Add FE link from calibration-blocked screen to the calibration quiz.
- [x] Fix archetype-rotation integration test broken by the new calibration gate.
- [x] Stop adding course sources from silently deleting modules merged from another course.
- [x] Stop retrying course research from deleting an absorbed course's source links.
- [x] Make an empty knowledge-map review result fail loudly, not look like nothing happened.
- [x] Apply the existing safe-address check to remaining unprotected link-fetch call sites.
- [ ] Add a draggable, tool-calling AI chat panel docked bottom-right app-wide.
  - [ ] Phase 1: docked draggable panel shell
  - [ ] Phase 2: wire panel to Q&A endpoint
  - [ ] Phase 3: RTL and e2e tests
- [x] Add AI Q&A with web search on curriculum topics, suggesting sub-topics.
  - [x] Phase 1: Q&A endpoint and tool-calling agent
  - [x] Phase 2: sub-topic suggestion tool
  - [x] Phase 3: on-demand web search tool
- [x] Add a cross-subject due-today review queue, listing every due item.
  - [x] Phase 1: backend selectDueQueue + endpoint
  - [x] Phase 2: frontend list on /today
- [x] Add global search by name across subjects, curricula, and topics.
  - [x] Phase 1: backend /search endpoint
  - [x] Phase 2: search box in header
- [x] Add a Delete-subject control to the web UI.
- [x] Add why-emphasis instruction to socratic.agent.ts, audit other agents.
- [x] Add test coverage for open-questions capture, list, resolve flow.
- [ ] Confirm learning-capture-inbox exists (issue 78), build only if missing.
- [x] Investigate per-subject scan locking; confirm whether a fix is needed.
- [x] Surface courses awaiting source approval on the dashboard and nav, not just a small badge.
- [x] Flag any course/module/topic needing a decision with an icon everywhere it's listed.
- [x] Show a visible error instead of silently hiding sections that fail to load.
