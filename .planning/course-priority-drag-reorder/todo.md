---
type: todo
branch: course-priority-drag-reorder
task: Course-level priority reordering with drag-and-drop manual override (web) — GitHub issue #69
state: open
updated: 2026-07-31
---
# Todo: Course-level priority reordering (drag-and-drop)

## Decisions to make
Nothing to decide — every fork resolved autonomously in `spec.md`'s "Decisions made
autonomously" (unattended run, recommended-default rule applied throughout).

## To review / clarify
- [ ] A human should eyeball the drag handle placement/icon choice
      (`lucide-react`'s `GripVertical`, before the existing course-name link) once
      built — pure visual/UX taste call, not a functional risk.
- [ ] Pre-existing bug found during planning, NOT fixed by this plan (out of scope —
      it's in `modules`, this issue is about `curricula`): `handleReorderModules`
      (`apps/api/src/module/module.controller.ts`) never checks that the reordered
      module ids belong to the curriculum named in the URL —
      `apps/api/src/server.ts:255-256` discards the captured `:id` entirely. Any
      caller can reorder modules across curriculum boundaries today undetected.
      Worth its own small follow-up ticket.

## To verify before coding (implementation-time, not planning-time)
- [x] Confirmed empirically (not just via docs): `sortableKeyboardCoordinates`
      compares real `getBoundingClientRect()` geometry, which jsdom always
      reports as zero — a real dnd-kit drag/keyboard simulation through RTL
      is not reliable here. Resolved by mocking dnd-kit at the module
      boundary in `subject-section.test.tsx` and invoking the real
      `onDragEnd` handler directly with a synthetic `DragEndEvent` — the
      actual `reorderAfterDrag` + `reorderCurricula` + revert-on-error wiring
      runs for real, only the drag gesture itself is stubbed. The local-order
      snap-back risk grill-plan raised is closed: `CourseList`'s `orderIds`
      state (not props) drives `SortableContext`'s `items`, updated
      synchronously before the mutation is awaited — proven directly by the
      "updates synchronously, before the mutation resolves" test.

## Manual steps
- [x] Ran `npm run db:migrate -w @post-anki/api` against local Docker Postgres
      (`post-anki-dev-db`, port 5437) — migration `0027_silent_hedge_knight`
      applied, backfill confirmed via `psql`: all 14 pre-existing rows in the
      one populated subject got distinct sequential `order` values (1-14),
      ascending by `created_at`.
- [ ] Manual browser verification of the actual real mouse-drag gesture and
      cross-tab live sync (Scenarios 1, 4) — genuinely not provable headlessly;
      not attempted here. What WAS proven headlessly instead: (a) the full
      HTTP/DB round trip via curl directly against the reorder endpoint
      (200, DB reflects new order, a fresh `GET /curricula` and the running
      `/` and `/dashboard` pages both reflect the new order — proving the
      backend + both SSR read paths agree), (b) the rejection path
      (foreign/incomplete id set → 400, zero rows changed), (c) that the
      drag handles + reordered names actually render in real server-rendered
      HTML from the dev server. NOT proven: the actual pointer-drag gesture
      itself, and the Electric live-sync cross-tab update (Scenario 4) —
      both require a real browser and are the one remaining human-only check.
- [x] `npm install` ran in `apps/web` after adding `@dnd-kit/core` (6.3.1),
      `@dnd-kit/sortable` (10.0.0), `@dnd-kit/utilities` (3.2.2) to
      `package.json`.

## Post-deploy checks
- [ ] After deploying the migration, spot-check a subject with 3+ pre-existing
      courses in production and confirm their `order` values are sane
      (ascending by original creation time), not all `0`.

## Follow-up (out of scope for this pass)
- [ ] Author a real Playwright e2e test for the drag-and-drop reorder flow in
      `verification-repo` (`projects/post-anki/post-anki/`) via `/e2e` or
      `/write-playwright-tests`, once this feature is merged. This IS reachable and
      technically feasible (Playwright can simulate a drag gesture headlessly) —
      deferred purely because authoring a new registered e2e feature there is a
      distinct unit of work from this build, not because it's out of reach.

## Build notes (added during implementation, 2026-07-31)
- [x] `curriculum.repo.test.ts`'s DoD command as literally written in
      spec.md (`npx vitest run apps/api/src/curriculum/curriculum.repo.test.ts`
      against the default config) returns "No test files found" — the
      default `vitest.config.ts` excludes this filename, and (confirmed
      empirically, contradicting that config file's own comment) an explicit
      CLI path does NOT bypass a configured `exclude` in this project's
      vitest 2.1.9. This is a **pre-existing latent issue**, not introduced
      here: `decide.repo.test.ts` has the exact same problem today. Working
      command used instead: `npx vitest run --config vitest.integration.config.ts
      src/curriculum/curriculum.repo.test.ts` (run from `apps/api`) — added
      this file's exact path to `vitest.integration.config.ts`'s `include`
      list to make that command work. `decide.repo.test.ts` was NOT touched
      (out of scope for this issue) but has the identical latent problem —
      worth its own small follow-up alongside the `handleReorderModules`
      scoping bug already flagged above.
- [x] `createSplitOutCurriculum` (curriculum.repo.ts, used by the structure-
      editor's split-into-new-course tool) was not in spec.md's "Files to
      modify" list, but also does an unscoped curriculum insert that would
      have landed at `order: 0` — colliding with the new invariant "every
      curriculum in a subject has a distinct order". Scoped it to
      `nextOrder()` the same way `createCurriculum` was, to keep the
      invariant intact for every curriculum-creation path, not just the
      primary one.
- [x] Two local env files were created (both already gitignored, not
      committed): `apps/api/.env` (copied from `.env.example`, points at
      local dev Postgres) and `apps/web/.env` (new — `API_BASE_URL` +
      `API_SHARED_SECRET` matching the api's, needed for the web dev
      server's SSR loader to authenticate against the local API). Also
      added a placeholder `OPENROUTER_API_KEY` to `apps/api/.env.local` —
      required by env validation to boot the dev server locally, unused by
      anything this feature touches.
