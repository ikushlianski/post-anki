# Local todo — tag-strength-surface

## Decisions to make
- None open — scope narrowed via advisor consult (topic side already shipped elsewhere, tag side
  is the only new work; see plan.md).

## To review-clarify
- None open.

## Coding tasks
- [x] Endpoint: GET /tags/mastery, defaults missing tags to status "new"
- [ ] UI: strength badge on each tag chip in tag-list.tsx, RED Playwright test first
- [ ] /check-ui browser verification before marking the UI phase done

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, additive read-only endpoint + UI.

## Resolved
- Phase 1 shipped: apps/api/src/tag/tag.repo.ts:getTagMasteryStatuses composes listTags +
  getTagMasteryLevels, defaulting a map miss to DEFAULT_TAG_MASTERY_ENTRY's "new" status. Wired via
  tag.service.ts/tag.controller.ts/router-table.ts/router.ts/server.ts as GET /tags/mastery.
  tsc + vitest (unit + 2 integration files, 10 tests) green.
