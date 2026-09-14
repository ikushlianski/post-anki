# Phase 2 report — drag-and-drop into categories

## Verdict: shipped

Both drag interactions work on the subject page, each behind an inline confirm bar, with a
client-side cycle guard. Verified in vitest (14 tests) and in a real headless browser against the
running dev server at `http://localhost:5540`.

## What shipped

- **Category cards are draggable + droppable.** Each category card in the subject page's root list
  now has a grip handle (`useDraggable`, `data.type === 'category'`) and the whole card is a drop
  target (`useDroppable`, same type), both inside the existing `DndContext` — no second context.
  `apps/web/src/subject/subject-section.tsx:311` (`CategoryCard`), `:221` (single `DndContext`
  wrapping both lists).
- **Curriculum rows drop onto categories.** The existing `useSortable` rows now carry
  `data: { type: 'category' }` on categories and `data: { type: 'curriculum' }` on rows, so
  `handleDragEnd` can tell the two drag kinds apart. `apps/web/src/subject/subject-section.tsx:124`.
- **Confirm-before-commit.** On drop, a `PendingMove` is held in local state and an inline bar
  ("Nest under X? confirm / cancel" or "File under X? confirm / cancel") renders on the target card.
  Only confirm calls the move. `apps/web/src/subject/subject-section.tsx:171` (`confirmMove`),
  `:380` (bar markup).
- **Client-side cycle rejection.** `resolvePendingMove`
  (`apps/web/src/subject/subject-section.tsx:43`) reuses `wouldCreateCategoryCycle` and returns
  null for a category-onto-own-descendant drop; `CategoryCard` also greys out descendant targets
  while dragging (`:349`).
- **Server function.** `moveCategory` in `apps/web/src/curriculum/curriculum.api.ts:320`
  (`moveCategoryInput.extend({ categoryId })`) backed by
  `apps/web/src/curriculum/api-client.ts:708` (`PATCH /subject-categories/:id` with `{ parentId }`).

## Tests

`apps/web/src/subject/subject-section.test.tsx` — 14 passing, including three new integration
tests (real dnd-kit pointer-event drag, not mocked) and three `resolvePendingMove` unit tests:

- category → category: confirm bar renders, `moveCategory` called only after confirm (`:234`).
- curriculum → category: confirm bar renders, `moveCurriculum` called only after confirm, subject
  unchanged (`:270`).
- `resolvePendingMove` returns null for a category onto its own descendant (`:188`).

Note on the cycle test: the subject page renders only *root* categories (`parentId === null`), so a
descendant can never be a rendered drop target there. The cycle rejection is therefore covered by a
unit test of the extracted `resolvePendingMove` (the exact condition that gates the confirm bar)
rather than a full DOM drag, since no descendant can appear in the DOM to drag onto.

## Browser verification

`tsc --noEmit` clean; `npx vitest run apps/web/src/subject/subject-section.test.tsx` → 14 passed.
Headless Chromium against the already-running dev server, subject
"Programming / Web Development" (two root categories): dragging "Web Theory" onto "AI" rendered
the confirm bar — before-drag count 0, after-drag count 1, text `Nest under AI? confirm cancel`,
no page errors. Confirm was intentionally not clicked to avoid mutating the dev database.

## Blockers

None. One environment caveat: the dev server is SSR-hydrated, so Playwright input only works after
hydration completes (~2.5s wait after `waitForSelector`); interactions before that are silent
no-ops and initially looked like a broken drag.
