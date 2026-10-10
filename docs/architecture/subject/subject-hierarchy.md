---
type: architecture
domain: subject
component: subject-hierarchy
state: as-built
updated: 2026-10-11
---
# Subject hierarchy

## What it is

A subject can sit under another subject, to any depth. The tree lives in two nullable columns on `subjects`: `parent_id` (null means top level) and `sort_order` (null means "no explicit position"). Curricula, topics, knowledge bits, cards and schedules keep their existing links and do not move with the tree. Only the subject row changes parent.

Nothing in the database enforces the tree. `parent_id` has no foreign key, following the schema's convention (`apps/api/src/db/schema.ts`, subjects table). The API checks cycles before a write, and deletion repairs the children it orphans.

## Pure helpers

`packages/core/src/subject-hierarchy/subject-hierarchy.ts` holds the rules as functions on plain `{ id, name, parentId }` rows, with no database access. Each one guards its walk with a visited set, so a malformed stored cycle ends instead of looping.

- `collectSubjectSubtreeIds`: the subject and all descendants.
- `wouldCreateSubjectCycle`: true when a parent is the subject itself or one of its descendants.
- `listValidMoveTargets`: every subject except the subject and its subtree.
- `buildSubjectPathLabel` and `listSubjectAncestorNames`: the path shown in menus and search results.
- `compareSubjectSiblings`: `sort_order` ascending, then subjects with no order last, then by name.

The API and the web app both import these from `@post-anki/core`, so the server and the UI apply the same rules.

## Server routes and repo

Code: `apps/api/src/subject/subject.controller.ts` and `apps/api/src/subject/subject.repo.ts`. Routes are in `apps/api/src/router-table.ts`.

- `GET /subjects` returns the full list ordered by `sort_order` (nulls last), then name. With `?query=` it runs a search instead.
- `GET /subjects?query=` matches name or description with a case-insensitive `ILIKE`. Results rank exact name, then name prefix, then anything else, and return at most 50 rows. The query is trimmed and limited to 100 characters.
- `PATCH /subjects/:id` accepts `parentId`. An unknown parent gives 400 `parent_not_found`. A self-parent or a cycle gives 400 `invalid_parent`.
- `PATCH /subjects/order` takes `{ parentId, orderedIds }`. It locks the sibling rows, then rewrites `sort_order` to 0..n-1. The id list must match the sibling set exactly, or the call returns 400 `invalid_id_set`. It is listed before the generic `PATCH /subjects/:id` route, so the literal path matches first.
- `POST /subjects` accepts `parentId` and checks that the parent exists. A new subject starts with a null `sort_order`, so it sorts after explicitly ordered siblings.

## Deleting a subject

`deleteSubject` runs under the per-subject lock. It deletes the subject's owned curricula, deletes the subject row, then moves each direct child up to the deleted subject's parent (top level if it had none). The moved children keep their relative order and go after that group's existing siblings. Stale duplicate-subject suggestions are invalidated in the same transaction. Only direct children move; grandchildren stay under their own parent.

## Review scope and knowledge sources

- `knowledge_sources.subject_id` is set when a source is created through `POST /knowledge-sources`, whether the body holds one text, a `texts` batch, or a `url`. An unknown `subjectId` gives 400 `subject_not_found`. The browser extension sends no subject, so its captures are unsorted (see `docs/architecture/extension/highlight-capture.md`).
- A bit's subject is read at query time, not copied. A placed bit (has a topic) belongs to its curriculum's subject. An unplaced bit belongs to its source's subject. The same rule appears in `apps/api/src/knowledge-bit/knowledge-bit-review-queue-picked.repo.ts` (`scopeCondition`), `subject-review-due-counts.repo.ts`, and `knowledge-bit-suspended.repo.ts` (`coalesce`).
- Review scoping by subject lives in `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`. It expands the chosen subject to its subtree with `collectSubjectSubtreeIds`, then filters the review queue. The subject-review due counts roll each subject's count up its whole subtree.

## Dashboard

- `apps/web/src/dashboard/dashboard-subject-list.tsx` is the live tree. It builds the nested structure, renders the ⋯ menu per row, and hosts the placement hook.
- `apps/web/src/dashboard/subject-expansion.ts` stores which rows are open in `localStorage` under `dashboard.expandedSubjects`. Everything starts collapsed on the server and on first paint, then the stored state loads.
- `apps/web/src/dashboard/sortable-subject-group.tsx` wires drag-to-reorder with `@dnd-kit` (pointer and keyboard sensors). On drop it sends the new sibling order to `reorderSubjects`. A failure shows an inline alert.
- `apps/web/src/dashboard/dashboard-subject-search.tsx` debounces input by 250 ms and calls `GET /subjects?query=`. A result label shows the ancestor path. Choosing a result expands its ancestors and highlights the row for 2 seconds (`use-subject-placement.ts`).
- The ⋯ menu (`apps/web/src/dashboard/subject-row-menu.tsx`, built on `apps/web/src/ui/overflow-menu.tsx`) offers Add sub-subject, Move under…, Rename and Delete. Move uses `apps/web/src/subject/subject-move-picker.tsx` with options from `subject-menu-model.ts`. Delete uses `apps/web/src/subject/subject-delete-confirm.tsx`, which states how many sub-subjects will move to the top level.
- `apps/web/src/dashboard/dashboard-tree.tsx` is not imported by any file under `apps/web/src`. The dashboard renders `DashboardSubjectList`.

## Data migration 0089

`apps/api/src/db/migrations/0089_nest-subjects-under-parents.sql` changes data only. It has three statements, each safe to re-run:

1. Sets `parent_id` on `Databases`, `Architecture`, `AI` and `Cloud Computing` to the earliest subject named `Programming / Web Development`. If no such subject exists, the statement changes nothing.
2. Inserts the Business sub-subjects `Time management`, `Sales`, `SMM`, `Negotiations`, `HR` and `Marketing` under the earliest subject named `Business`, skipping any that already exist under it.
3. Deletes nothing.

The parent it targets is named `Programming / Web Development`, not `Programming`. A subject named plainly `Programming` is not touched by this migration.

## Known limits

- Not verified in a browser. This doc comes from reading the code and its existing unit and integration tests.
- Cycle checks and orphan repair are application logic. A direct SQL write can break the tree, and nothing in the schema stops it.
- The search returns a flat list capped at 50 rows, not a tree.
- Drag-reorder rewrites every sibling's `sort_order` on each drop. Concurrent reorders of one group serialize on the row lock.

## Plans

- `.planning/sub-subjects/plan.md`: nested subjects for the dashboard, paste and review.
- `.planning/sub-subjects/drag-and-search-plan.md`: drag-to-reorder and search.
