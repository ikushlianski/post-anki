# Plan: drag subjects to reorder siblings, and dashboard subject search (MVP)

Binding architecture: `.planning/sub-subjects/plan.md` (no brief.md in this folder). It assumes its `subjects.parent_id`, nested display, "Add sub-subject" and "Move under…" exist. `subjects.sort_order` is already in the uncommitted `apps/api/src/db/migrations/0088_futuristic_toad_men.sql`, so this plan adds no migration.

## Goal
On the dashboard, a user can reorder subjects among their siblings by dragging or keyboard, and can search subjects by name with each match shown with its parent path.

## Approach
- Order is scoped to one sibling group (same `parent_id`, null = top level). A reorder is one bulk write: the server accepts the exact sibling id set and rewrites all positions in one transaction.
- Cross-parent drops are impossible by construction: each sibling group is its own DndContext. Re-parenting stays with "Move under…".
- Search calls the existing `GET /subjects?query=` through a server fn. The server ranks; the client renders the response as-is.
- Path labels come from the subject list the dashboard already holds (all subjects, with parent ids).
- One sibling comparator (`sort_order` asc, nulls last, then name) is shared by the list, the nested display and search.
- No new dependency: `@dnd-kit/core`, `@dnd-kit/sortable` and `@dnd-kit/utilities` are already in `apps/web/package.json`.

## Steps
1. `packages/shared/src/subject.ts`: add `reorderSubjectsInput` = `{ parentId: string | null, orderedIds: string[] }`, plus its type.
2. `packages/core/src/subject-hierarchy/subject-hierarchy.ts`: add `compareSubjectSiblings(a, b)` and `listSubjectAncestorNames(id, rows)` (root first, cycle-safe).
3. `apps/api/src/router-table.ts`: add `PATCH "/subjects/order"` named `reorderSubjects` before the `PATCH /subjects/:id` entry (about line 139), or `order` is captured as an id. `apps/api/src/router.ts`: add `"reorderSubjects"` to `RouteName`.
4. `apps/api/src/subject/subject.repo.ts`: `reorderSubjects(parentId, orderedIds)` in `getDb().transaction`. Lock the sibling rows with `SELECT ... FOR UPDATE`. Return `invalid_id_set` unless ids are unique and equal the sibling set. Return `parent_not_found` for an unknown non-null parent. Otherwise set `sort_order` to each index.
5. `apps/api/src/subject/subject.controller.ts`: `handleReorderSubjects` parses the body with `reorderSubjectsInput` and maps errors to 400.
6. `apps/api/src/api-server.ts`: add the `reorderSubjects` case next to `updateSubject` (about line 464).
7. `apps/web/src/curriculum/api-client.ts`: add `reorderSubjects(input)` = `PATCH /subjects/order`. Reuse `searchSubjects` (line 310).
8. `apps/web/src/subject/subject.api.ts`: add server fns `reorderSubjects` (POST) and `searchSubjects` (GET; query trimmed, 1 to 100 chars).
9. `apps/web/src/curriculum/model.ts` (subject schema: `sortOrder` nullable optional) and `apps/web/src/curriculum/board.collection.ts` (`SubjectRow.sort_order`, mapped in `mapSubjectRow`).
10. New `apps/web/src/dashboard/sortable-subject-group.tsx`: renders one sibling list. Props: `parentId`, `siblings`, `renderRow(subject, handleProps)`. It owns a DndContext with PointerSensor (distance 8) and KeyboardSensor (`sortableKeyboardCoordinates`). Drops use `reorderAfterDrag` from `apps/web/src/curriculum/curriculum-drag-order.ts`. The new order shows at once. On failure it restores the old order and shows `data-testid="reorder-error"` (`role="alert"`). On success it calls `router.invalidate()`.
11. `apps/web/src/dashboard/dashboard-subject-list.tsx`: wrap the top-level list and each child list in `SortableSubjectGroup`. Sort with `compareSubjectSiblings`. Add a grip handle with `touch-none`, `aria-label="Drag to reorder"`, and the sortable attributes and listeners.
12. New `apps/web/src/dashboard/dashboard-subject-search.tsx`: a `type="search"` input (`aria-label="Search subjects"`, `maxLength={100}`). It has a 250 ms debounce in a useEffect timer, drops stale responses, and clears on Escape. Each result shows `ancestors.join(' / ') + ' › ' + name`, or just the name at top level, and links to `/subject/$subjectId`. An empty trimmed query shows the normal list. An empty result shows `No subjects match "<query>".`
13. `apps/web/src/dashboard/dashboard-view.tsx`: mount the search directly under the header. Pass `subjects`. Hide the sortable lists while a query is active. Do not touch `apps/web/src/routes/index.tsx`.

## Tests
- `packages/core/src/subject-hierarchy/subject-hierarchy.test.ts`: nulls last then by name; ancestor names root-first at depth 3; root gives []; a malformed cycle terminates.
- `apps/api/src/subject/subject-reorder.integration.test.ts` (new, real DB, like `subject-search.repo.integration.test.ts`): positions become 0..n-1 for one group only; null parent covers top level only; missing, extra, duplicate and other-parent ids give `invalid_id_set` with no row changed; unknown parent gives `parent_not_found`.
- `apps/api/src/router.test.ts`: `PATCH /subjects/order` resolves to `reorderSubjects`; `PATCH /subjects/abc` still resolves to `updateSubject`.
- `apps/api/src/subject/subject.controller.test.ts`: a malformed body gives 400.
- `apps/web/src/dashboard/sortable-subject-group.test.tsx`: Space, ArrowDown, Space saves the new order; a failed save restores the order and shows the alert. Copy the `dragTo` and `settleAfterDrag` helpers from `subject-section.test.tsx` for the pointer case.
- `apps/web/src/dashboard/dashboard-subject-search.test.tsx`: no request before 250 ms; a burst of typing sends one request; a returned subject whose name lacks the query still renders; path label format; empty state; Escape restores the list; a stale response is ignored.

## Done when
- Pointer drag and Space/Arrow keys reorder siblings, the order survives reload, and a drop onto another parent changes nothing.
- A failed save reverts the visible order and shows an error.
- Search shows server-ranked matches with parent paths; no match shows the empty state; Escape clears; one request per typing pause.
- `PATCH /subjects/order` never reaches the `:id` handler.
- `npx tsc --noEmit` and lint are clean in api, core, shared and web; `npx vitest run` passes for touched files.

## Defaults chosen
- `PATCH /subjects/order` with `{parentId, orderedIds}`: a flat route needs no parent segment for top level.
- Literal route before `/subjects/:id`: `resolveRoute` takes the first match.
- Positions rewritten as 0..n-1: one clean order; nulls disappear after the first reorder.
- Duplicate ids rejected: the `reorderCurricula` size check passes `[a, b, a]` for `{a, b}`.
- Row lock on siblings, not a new advisory lock: serializes concurrent reorders of one group with no new key.
- One DndContext per sibling group: cross-parent drops cannot happen.
- PointerSensor distance 8 plus KeyboardSensor, handle `touch-none`: matches `subject-section.tsx`; without it touch drags scroll the page.
- Reuse `reorderAfterDrag`: an existing tested helper.
- Keep local order after success, keyed by sibling id set: no flicker before Electric syncs; membership changes remount.
- Debounce 250 ms in useEffect, no library: small and already a pattern in the repo.
- Result label follows the user's example (`Parent / Path › Name`), which differs from core's `A › B` helper. Reconcile both; the Move-under picker keeps the core helper.
- Client builds labels from loaded subjects: the server returns only matches, and the board already has every subject.
- Search replaces the sortable lists while a query is active: no drag inside results, one list at a time.
- Server search via a GET server fn over the existing route: no new read route.
- Electric board row carries `sort_order`: subjects already sync through Electric, so no new read path.

## Footprint
Repo root: `/Users/ikushlianski/webdata/ilya-projects/post-anki`
- packages/shared/src/subject.ts
- packages/core/src/subject-hierarchy/subject-hierarchy.ts (+ .test.ts)
- apps/api/src/router-table.ts; apps/api/src/router.ts; apps/api/src/router.test.ts; apps/api/src/api-server.ts
- apps/api/src/subject/subject.repo.ts; subject.controller.ts (+ .test.ts); subject-reorder.integration.test.ts (new)
- apps/web/src/curriculum/api-client.ts; model.ts; board.collection.ts
- apps/web/src/subject/subject.api.ts
- apps/web/src/dashboard/sortable-subject-group.tsx (new, + test); dashboard-subject-search.tsx (new, + test); dashboard-subject-list.tsx; dashboard-view.tsx
END-OF-REPORT
