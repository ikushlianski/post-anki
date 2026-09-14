# Phase 1 report — nest one category under another

## What exists now

A `PATCH /subject-categories/:id` endpoint re-parents a category under another category
(`{ parentId: string | null }`), rejecting any move that would cross subjects or create a cycle.

## Built

### Cycle check (pure, `packages/core`)

`packages/core/src/subject-category/would-create-cycle.ts` exports `wouldCreateCategoryCycle
(categoryId, newParentId, categories)`. It reuses `resolve-category-path.ts`'s `CategoryPathRef`
type and its parent-walk shape (the same `while (currentId !== null)` loop), but walks *up* from
the proposed parent instead of down from the root: it returns `true` the moment `categoryId` is
reached, i.e. when `newParentId` is `categoryId` itself or a descendant. Exported through the
subject-category barrel (`index.ts`).

Co-located unit test `would-create-cycle.test.ts` covers all four required cases: valid move (no
cycle), self-parent rejected, descendant-as-parent rejected, and cross-subject left to
`validateCategoryBelongsToSubject`.

### Repo

`apps/api/src/subject-category/subject-category.repo.ts` gains `moveCategory(categoryId,
parentId)`, returning `SubjectCategory | { error: MoveCategoryError }` with the same
discriminated-union shape as `insertCategory`. Checks, in order: the category exists
(`category_not_found`), the parent exists anywhere (`parent_not_found`), the parent belongs to the
category's own subject via `validateCategoryBelongsToSubject` (`parent_wrong_subject`), and the
move is acyclic via `wouldCreateCategoryCycle` (`would_create_cycle`). Only then runs
`update(subjectCategories).set({ parentId })`.

### Routing

- `packages/shared/src/subject-category.ts` — `moveCategoryInput` (`{ parentId: z.string().nullable() }`),
  following the existing Zod input convention.
- `apps/api/src/subject-category/subject-category.controller.ts` — `handleMoveCategory`, mapping
  `category_not_found`/`parent_not_found` → 404 and `parent_wrong_subject`/`would_create_cycle` → 400,
  mirroring `handleCreateSubjectCategory`'s error-shaping.
- `apps/api/src/router-table.ts:30` — `PATCH /^\/subject-categories\/([^/]+)$/` → `moveCategory`.
- `apps/api/src/router.ts:12` — new `RouteName` member.
- `apps/api/src/server.ts:341` — `case "moveCategory"` wired to `handleMoveCategory(req, res, id)`.

## Decisions

- The cycle check takes a plain `CategoryPathRef[]` (the full category list) and is subject-agnostic:
  cross-subject safety is a separate concern, owned by `validateCategoryBelongsToSubject` at the
  repo layer, exactly as the plan specifies.
- `moveCategory` fetches all categories only when `parentId` is non-null, and reads the target row
  with a direct `getDb().select()`, matching `insertCategory`'s existing style.
- No DB migration: `subjectCategories.parentId` already exists; this is a read-validate-write on an
  existing column.

## Verified

- `npm run typecheck -w @post-anki/core -w @post-anki/shared -w @post-anki/api` — clean.
- `packages/core` subject-category suite — 4 files, 16 tests, all passing (includes the 4 new cycle
  tests).
- `apps/api` unit suite — 50 files, 550 tests, all passing.

No frontend files touched; no commit or push.
