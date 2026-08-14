# TODO: Course-priority-reordering rebuild

## Pre-implementation checklist

- [ ] Verify migration 0045 generates with `drizzle-kit generate` (run locally, check output)
- [ ] Hand-extend migration SQL with per-subject backfill UPDATE (exclude containers)
- [ ] Test migration locally: `npm run db:migrate -w @post-anki/api`, verify curricula.order column exists

## Implementation phases (in order)

### Phase 1: Data model

- [ ] Add `order: integer("order").notNull().default(0)` to `curricula` in schema.ts
- [ ] Generate + hand-extend migration 0045 with backfill
- [ ] Apply migration: `npm run db:migrate -w @post-anki/api`
- [ ] Verify: query `SELECT subject_id, "order" FROM curricula ORDER BY subject_id, "order"` — non-containers have ascending orders per subject; containers at 0

### Phase 2: Core reorder logic

- [ ] `/tdd curriculum-drag-order.ts` — implement `reorderAfterDrag(ids, activeId, overId): string[]`, test all edge cases
- [ ] Update `packages/shared/src/curriculum.ts`:
  - [ ] `curriculumSchema` gains `order: z.number().int()`
  - [ ] Add `reorderCurriculaInput = z.object({ orderedIds: z.string().array() })`

### Phase 3: Backend reorder endpoint

- [ ] `curriculum.repo.ts`:
  - [ ] `listCurricula()` — add `orderBy(asc(curricula.subjectId), asc(curricula.order))`
  - [ ] `createCurriculum()` — add read of existing orders, assign `order: nextOrder(...)` (only if NOT container)
  - [ ] `createSplitOutCurriculum()` — same order assignment
  - [ ] New `reorderCurricula(subjectId, orderedIds)` — validation + transactional write
- [ ] `curriculum.controller.ts` — new `handleReorderCurricula`
- [ ] `router.ts` — new route: `PATCH /subjects/:id/curricula/order`, route name `"reorderCurricula"`
- [ ] `server.ts` — new case for `"reorderCurricula"`
- [ ] Vitest: curriculum.repo.test.ts — validation (containers excluded, exact-id-set match, transactional), createCurriculum order logic, listCurricula ordering

### Phase 4: Frontend data layer

- [ ] `apps/web/src/curriculum/board.collection.ts`:
  - [ ] Add `order: number` to `CurriculumRow` interface
  - [ ] `mapCurriculumRow()` reads it through
- [ ] `apps/web/src/curriculum/model.ts`:
  - [ ] `curriculumSchema` gains `order: z.number().int()`
- [ ] Vitest: verify order flows through mock data

### Phase 5: Frontend API / server functions

- [ ] `apps/web/package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`; run `npm install`
- [ ] `curriculum.api.ts` — new `reorderCurricula(subjectId, orderedIds)` server-fn
- [ ] `api-client.ts` — new `reorderCurricula(subjectId, orderedIds)` → PATCH call

### Phase 6: Frontend UI — drag interaction

- [ ] Create `curriculum-drag-order.test.ts` — RTL tests for:
  - [ ] Drag-end callback calls mutation with correct order
  - [ ] Local state updates synchronously
  - [ ] Language-practice subjects render no drag handle
  - [ ] Rejected mutation shows error span + reverts local state
- [ ] `subject-section.tsx`:
  - [ ] Add DndContext + SortableContext wrapper around curricula list
  - [ ] Add drag handle per curriculum (grip icon)
  - [ ] Add local `useState` for order state
  - [ ] Implement `onDragEnd` handler:
    - [ ] Call `reorderAfterDrag()` to compute new order
    - [ ] Update local state synchronously
    - [ ] Call `reorderCurricula()` inside try/catch
    - [ ] On success: `router.invalidate()`
    - [ ] On error: show error span + revert local state
  - [ ] Verify language-practice branch is unchanged (no handles rendered)
- [ ] Vitest: subject-section.test.tsx — component test coverage as per test list above

### Phase 7: Frontend — live sync

- [ ] `board.collection.ts` — verify `order` is included in shape (it should be automatically)
- [ ] `routes/index.tsx` — HomeView's curricula-per-subject filter also sorts by order
- [ ] Manual verification (documented below)

### Phase 8: Verification & cleanup

- [ ] Vitest: `npx vitest run apps/api/src/curriculum/curriculum.repo.test.ts` (all AC #1–5)
- [ ] Vitest: `npx vitest run apps/web/src/curriculum/curriculum-drag-order.test.ts` (AC #6)
- [ ] Vitest: `npx vitest run apps/web/src/subject/subject-section.test.tsx` (AC #7–8)
- [ ] Manual verification:
  - [ ] Dev server running (`npm run dev`)
  - [ ] At least 2 courses under one subject on home page
  - [ ] Perform actual mouse drag to reorder
  - [ ] Reload page — confirm new order persists (AC #9)
  - [ ] Open second browser tab on same page
  - [ ] Go back to first tab, reorder again
  - [ ] Confirm second tab live-updates to match (AC #9, live-sync)
- [ ] ESLint + TypeScript: `npx tsc --noEmit`, fix any errors
- [ ] Type safety: confirm no `any` types introduced

## Known issues flagged (not fixed in this pass)

- **`reorderModules` has zero curriculum scoping** (curriculum.controller.ts:handleReorderModules, server.ts:255-256). Any caller can reorder modules across curriculum boundaries; backend discards the `:id` path parameter. File a follow-up issue or add to a future scope-hardening pass. Not touched here — out of scope for #69.
- **Cross-course refocus suggestion (#70)** — the old branch's `course_refocus_dismissals` table, `course-refocus.repo.ts`, controller, and web banner are reference material only. They're #70 work. A future PR building #70 will land those files alongside this one's changes.

## Post-implementation (deferred)

- [ ] Run `/debrief` on this feature to auto-generate `docs/architecture/course-priority-drag-reorder/` (as-built.mmd + review.md)
- [ ] Playwright e2e test in `verification-repo` (simulating real drag gesture) — tracked separately

## Rollback steps (if needed)

1. Revert all files listed in "Files to modify" above
2. Drop migration 0045: `npm run db:migrate -w @post-anki/api down` (one step)
3. Delete newly created files: `curriculum-drag-order.ts`, `curriculum-drag-order.test.ts`, updated subject-section.test.tsx
4. Uninstall dnd-kit: `npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
5. Verify: `npx tsc --noEmit` (types clean), `npm run build` succeeds
