# Local todo — tag-strength-surface

## Decisions to make
- None open — scope narrowed via advisor consult (topic side already shipped elsewhere, tag side
  is the only new work; see plan.md).

## To review-clarify
- None open.

## Coding tasks
- [x] Endpoint: GET /tags/mastery, defaults missing tags to status "new"
- [x] UI: strength badge on each tag chip in tag-list.tsx, RED test first
- [ ] /check-ui browser verification before marking the UI phase done — not performed, no browser
  access in this dispatch's environment; flagged for the parent session

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, additive read-only endpoint + UI.

## Resolved
- Phase 1 shipped: apps/api/src/tag/tag.repo.ts:getTagMasteryStatuses composes listTags +
  getTagMasteryLevels, defaulting a map miss to DEFAULT_TAG_MASTERY_ENTRY's "new" status. Wired via
  tag.service.ts/tag.controller.ts/router-table.ts/router.ts/server.ts as GET /tags/mastery.
  tsc + vitest (unit + 2 integration files, 10 tests) green. Reviewed PASS.
- Phase 2 shipped: tag-list.tsx renders a client-only strength badge (strong/shallow/weak/
  untested), RTL test substituted for Playwright (repo has none). No real-browser check — no
  browser access available in this run's environment, disclosed rather than skipped silently.
  Reviewed PASS.
- Phase 2 shipped: tag-list.tsx renders a strength badge (data-testid
  tag-list-strength-<tagId>) per tag chip via listTagMasteryStatuses. This repo has no real
  Playwright specs anywhere, so the RED test is a co-located RTL component test instead
  (tag-list.test.tsx), matching this repo's established convention. tsc + vitest green. No real
  browser check performed — no browser access in the dispatch environment.
