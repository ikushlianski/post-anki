# Drag-and-drop into categories

## What and why
Categories already nest (`subjectCategories.parentId`), and curricula can already be filed into a
category via a "Move to…" dropdown. Neither is reachable by drag-and-drop today. Users expect to
drag a category onto another to nest it, and drag a curriculum onto a category to file it —
confirmed live: a user tried both and neither worked.

## Constraints and risks
- `subjectCategories.parentId` has no FK and no DB-level cycle protection — dragging a category
  onto its own descendant must be rejected before any write, by walking the parent chain
  (`resolveCategoryPath` in `packages/core/src/subject-category/resolve-category-path.ts` already
  does this walk; reuse its shape for a new cycle check rather than re-deriving it).
- A category can only be dropped onto another category in the *same subject* — reuse
  `validateCategoryBelongsToSubject` (`packages/core/src/subject-category/validate-category-belongs-to-subject.ts`).
- `moveCurriculum` (`apps/web/src/curriculum/api-client.ts:695`, backend
  `moveCurriculumToSubject` in `apps/api/src/curriculum/curriculum.repo.ts`) already supports
  `categoryId` — dropping a curriculum onto a category is a pure frontend wiring task, no new
  endpoint.
- Every drop (either kind) shows a confirm dialog before committing — explicit requirement, not
  optional.
- `apps/web/src/subject/subject-section.tsx` already uses `@dnd-kit/core` + `@dnd-kit/sortable`
  for list reordering (`useSortable`) — reuse the same `DndContext`, add `useDraggable`/
  `useDroppable` for the new cross-container drag rather than introducing a second DnD library.

## Phases

### Phase 1: Backend — nest one category under another
Goal: a PATCH endpoint moves a category's `parentId`, rejecting a cross-subject or cycle-forming
move. Key files: `apps/api/src/subject-category/subject-category.repo.ts` (new `moveCategory`
function), `apps/api/src/subject-category/subject-category.controller.ts` (new controller file —
none exists yet, categories are currently only created via `curriculum.controller.ts`'s wiring —
check `apps/api/src/server.ts`/`apps/api/src/router-table.ts` for how `/subjects/:id/categories` is
routed today and add `PATCH /subject-categories/:id` alongside it), `packages/shared/src` (request/
response types), `packages/core/src/subject-category/` (new cycle-check function, unit tested).

### Phase 2: Frontend — drag categories onto categories, curricula onto categories
Goal: both drag interactions work, each behind a confirm dialog, using the Phase 1 endpoint and the
existing `moveCurriculum`. Key files: `apps/web/src/subject/subject-section.tsx` (category cards
become both draggable and droppable; curriculum rows become draggable), a new small confirm-dialog
component if one doesn't already exist (check for an existing modal/dialog pattern in
`apps/web/src` before adding one), `apps/web/src/curriculum/api-client.ts` (new `moveCategory`
client function mirroring `moveCurriculum`'s shape).
