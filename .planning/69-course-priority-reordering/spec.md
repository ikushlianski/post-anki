---
type: spec
branch: course-priority-reordering-rebuild
task: "Course-level priority reordering with drag-and-drop manual override (web) — GitHub issue #69"
complexity: complex
state: planned
updated: 2026-08-14
verification:
  targetDb: "Postgres with migration 0045 applied; curricula.order column backfilled per-subject"
  containerCurricula: "Validation query excludes container curricula (container_area_node_id IS NULL) to match listCurricula filter"
---

# Plan: Course-level priority reordering (drag-and-drop rebuild)

## What this story is, in one paragraph

Today a learner cannot reorder which course gets attention first within a subject — priority/ranking only exists inside a curriculum (domain-priority-review, topic-ordering-importance). This plan adds course-level drag-and-drop reordering scoped to "courses within one subject" (`SubjectSection` already partitions curricula by subject, matching how users see them). A learner drags a course to reorder it; the new order persists via a new `curricula.order` column backfilled per-subject; and the order flows through Electric's unchanged shape sync so live-synced views reflect the new position immediately.

This is a genuine rebuild against current `main`, not a merge of the stale `course-priority-drag-reorder` branch (commit `75f0e35`, 75 commits behind). The old branch's migration numbers collide with already-applied unrelated migrations, the single commit tries to write to a `curricula.domain_node_id` column `main` has since dropped (issue #84's decoupling work), and the same commit bundles a second unrelated feature (`cross-course-refocus-suggestion`, now issue #70) that is out of scope here.

## Verified facts

- **Current schema confirms domain_node_id column is gone.** `apps/api/src/db/schema.ts` lines 34–85: `curricula` table no longer has a `domain_node_id` column; issue #84's decoupling replaced it with `curriculum_domain_node_mappings` table (lines 129+). This is a real compile incompatibility, not just staleness — the old branch's `curriculum.repo.ts` changes write `domainNodeId: input.domainNodeId ?? null` directly to a row, which will fail at the drizzle type level.
- **Three curriculum create paths exist; two need order assignment.** `createCurriculum` (curriculum.repo.ts:174) and `createSplitOutCurriculum` (curriculum.repo.ts:1522) both insert into `curricula`. `findOrCreateAreaContainer` (learning-list/area-container.repo.ts:61) calls `createCurriculum` with `containerAreaNodeId` set, so it's not a third independent insert path — it's a caller of the first. The second path (`createSplitOutCurriculum`) is reached only by structure-editor splits, not by learner-facing create actions, but both need `nextOrder` scoping since both can co-exist in the same subject.
- **`assignOrders` and `nextOrder` already exist in packages/core.** `packages/core/src/curriculum/ordering.ts:1-9` defines both functions, with tests (`ordering.test.ts`). These are reusable, entity-agnostic pure functions — no modifications needed.
- **Electric shape registry includes curricula with no column allowlist.** `apps/api/src/electric/electric-shape-registry.ts:21`: curricula is defined as `{ table: "curricula", where: "container_area_node_id IS NULL" }` with no `columns` array. Per the registry logic (lines 88–90), absence of a `columns` array means all columns sync — the new `order` column will flow through unchanged without requiring any registry update.
- **Current `listCurricula` filters containers correctly; validation query must match.** `apps/api/src/curriculum/curriculum.repo.ts:100-104` shows the live read-path filters with `r.containerAreaNodeId === null`. The reorder endpoint's validation (Scenario 5 below) reads `SELECT id FROM curricula WHERE subject_id = ?` — if this query includes the container row and the learner's payload doesn't (because the UI never shows it), every reorder is rejected. **This is a critical bug the old spec didn't catch.** Fix: validation query carries `container_area_node_id IS NULL` in the WHERE clause (Acceptance Criterion #5 below).
- **`toCurriculum` function signature changed.** `curriculum.repo.ts:1609-1641` shows `toCurriculum` now takes three arguments: `row`, `origin`, and `primaryDomainNodeId`. The old spec's diff (`git show course-priority-drag-reorder:apps/api/src/curriculum/curriculum.repo.ts | grep -A5 "function toCurriculum"`) shows it taking only `row` and `origin`. Every call site must pass the third argument — this isn't optional. All `listCurricula`, `getCurriculum`, `createCurriculum`, etc. already do (lines 138, 343, 234); new code must match.
- **`pgTable` now uses two-argument form with indexes.** `apps/api/src/db/schema.ts:34-85` shows `curricula = pgTable("curricula", {...}, (table) => [...])` — the old single-argument form. The schema change must use the two-arg form and include no new indexes for `curricula` itself (modules and topics don't have `order` indexes; topics gained `topics_curriculum_id_progress_last_interacted_at_idx` in issue #70's table, not this one).
- **`listCurricula` is the read-path, filtering containers.** Confirmed: the function is called by every view that displays courses (`getBoard`, `subject-section.tsx` via `curriculum.api.ts`). The Electric-synced board collection in `board.collection.ts` consumes `curriculaCollection` which mirrors the server's "show no containers" rule via the shape registry's `where` clause.
- **Next available migration number is 0045.** `ls -1 apps/api/src/db/migrations/*.sql | tail -5` shows 0044 as the latest. The new migration goes to `0045_*.sql`.
- **`MergeCurriculumButton` has working try/catch + error span.** `subject-section.tsx:137-230` (lines checked: `onSuccess` at 161, error handling at 225). `DeleteCurriculumButton` and `DeleteSubjectButton` (lines 121–133) have zero error handling — stale `setBusy` on rejection. Grill-plan caught this; reorder error handling copies `MergeCurriculumButton`'s pattern, not the broken one.
- **Bundle check: cross-course-refocus-suggestion is a separate issue.** `gh issue view 70` confirms it exists as GitHub issue #70: "Cross-course 'refocus' suggestion when priorities shift." The old branch bundles `course_refocus_dismissals` table, `course-refocus.repo.ts`, `course-refocus.controller.ts`, and `course-refocus-banner.tsx` — all #70 work, not #69. These stay unbuilt here.

## Decision 1 — Container curricula excluded from reorder validation

**Why this matters.** `listCurricula` (curriculum.repo.ts:100-104) filters `containerAreaNodeId === null` — container rows never reach the UI. The old spec's validation query (`SELECT id FROM curricula WHERE subject_id = ?`) includes containers. Any subject with an Area container would reject every legitimate reorder as `invalid_id_set` because the backend sees N+1 rows (N courses + 1 container) but the payload has N (only the courses the UI can show).

**What this plan does.** The validation query in `reorderCurricula` (curriculum.repo.ts) carries the same `container_area_node_id IS NULL` filter:
```
SELECT id FROM curricula 
WHERE subject_id = ? AND container_area_node_id IS NULL
```
This ensures the backend's expected set exactly matches what the UI can send. Acceptance Criterion #5 below explicitly tests this with a fixture that includes a container row.

## Decision 2 — Container curricula get the default order value (0)

**Why this matters.** `findOrCreateAreaContainer` (learning-list/area-container.repo.ts:61) calls `createCurriculum`, which will insert a row with `order: nextOrder(...)`. But container rows are never reordered by learners — they're internal plumbing. Setting a semantic order for internal plumbing is scope creep.

**What this plan does.** `createCurriculum` assigns `order: nextOrder(existing.map((r) => r.order))` only when the curriculum is **not** a container (no `containerAreaNodeId` set). The signature already includes `containerAreaNodeId?: string` as a repo-internal addition — the function already knows whether it's making a container. For a container create, `order` stays at its `NOT NULL DEFAULT(0)` value.

Containers at order 0 never collide with learner-created courses (which start at 1) because:
- Learner courses: order 1..N per subject (assigned by `nextOrder`)
- Containers: order 0 (implicit, never touched by reorder)
- `listCurricula` filters containers out anyway, so their order value is irrelevant to any read path

## Decision 3 — `createSplitOutCurriculum` also needs order assignment

**Why this matters.** The spec noted `createSplitOutCurriculum` (curriculum.repo.ts:1522) — the structure-editor's "split this module into its own course" action. It inserts a new curriculum directly at `status: "shaping_structure"`, not through the learner-facing create flow. But it's in the same subject and can co-exist with other courses, so it needs the same `nextOrder` assignment to avoid collisions.

**What this plan does.** `createSplitOutCurriculum` gets the same `nextOrder` logic: read existing curricula in the subject, assign `order: nextOrder(...)`. This is called only from `handleSplitModule` in `structure-turns.controller.ts` — a rare internal path, but consistency matters.

## Scope boundary

- **Cross-subject drag is out of scope.** Reorder is confined to "within one subject," matching the only grouping the UI already uses (`SubjectSection` partitions curricula by subject).
- **No separate priority tier.** Only manual `order` — modules/topics carry both `order` and `priority` (-1/0/1), but curricula don't need a promote/demote tier, only position.
- **No automated e2e Playwright test.** Covered by vitest unit tests on the pure reorder logic and RTL component tests on the drag wiring. A `verification-repo` Playwright e2e is a genuine follow-up, documented in `todo.md`, not a permanent gap.
- **Cross-course refocus suggestion (#70) is not built here.** That feature's own table (`course_refocus_dismissals`), repo, controller, and web banner are reference material only; they're scoped to issue #70. A future PR building #70 will land those files alongside this one's changes.
- **`language-practice` subjects are unaffected.** They never render a curricula list today and continue not to — `subject-section.tsx` already has a `kind` branch that excludes them.
- **No new architecture doc written by this plan.** Post-build, running `/debrief` on this feature will write `docs/architecture/course-priority-drag-reorder/` (per this repo's established convention), not a pre-build spec.

## Implementation phases

| Phase | Backend | Frontend | Key decision |
|---|---|---|---|
| 1 — Data model + pure fn | Migration 0045: `curricula.order` + backfill; no changes to `packages/core` | New `reorderAfterDrag` pure fn in `curriculum-drag-order.ts` + unit tests | Backfill per-subject, ordered by `created_at`; containers stay at 0 |
| 2 — Reorder endpoint | `reorderCurricula()` repo fn + controller + router; `listCurricula()` gains `ORDER BY`; `createCurriculum()` assigns `nextOrder` | None | Validation excludes containers; write wrapped in `db.transaction()` |
| 3 — Web UI | None | `@dnd-kit/*` added; `subject-section.tsx` gets drag handles + local order state; `board.collection.ts`/`model.ts` read `order` | Optimistic local state required (else dnd-kit snaps back); error handling copies `MergeCurriculumButton`'s try/catch |

## Files by scenario

| Scenario | Backend | Frontend | Description |
|---|---|---|---|
| 1 — Drag reorders within subject | `curriculum.repo.ts` (`reorderCurricula`), `curriculum.controller.ts`, `router.ts`, `server.ts` | `subject-section.tsx`, `curriculum-drag-order.ts`, `curriculum.api.ts`, `api-client.ts` | Core reorder flow, with exact-id-set validation |
| 2 — New course joins at back | `curriculum.repo.ts` (`createCurriculum`) | None | `nextOrder` scoped to subject |
| 3 — Zero/one course, no drag UI | None | `subject-section.tsx` | dnd-kit renders but disables drag (SortableContext with 0–1 items) |
| 4 — Live sync across tabs | None (Electric already syncs all columns) | `board.collection.ts`, `routes/index.tsx` | `order` column syncs via Electric; HomeView sorts by order |
| 5 — Foreign or incomplete id set rejected | `curriculum.repo.ts` (`reorderCurricula`), wrapped in `db.transaction()` | None | Validation: exact-set match; includes container filter |
| 5b — Rejection surfaces visibly | None | `subject-section.tsx` | Try/catch error handling + revert local state (mirrors `MergeCurriculumButton`) |
| 6 — Pre-existing courses get sane order | Migration 0045: backfill `UPDATE` | None | One-time per-subject sequential assignment |
| 7 — No reorder UI on language-practice subjects | None | `subject-section.tsx` | Existing `kind` branch already excludes these; no change needed |
| 8 — `order` flows through Electric sync | None (shape registry has no column allowlist for curricula) | `board.collection.ts`, `model.ts` | `order` syncs as part of full curricula shape |
| 9 — Reorder is REST PATCH, not Electric write | `curriculum.controller.ts`, `router.ts` | `curriculum.api.ts`, `api-client.ts` | Prevents concurrent reorder/Electric-write conflicts |

## Files to create

```
apps/api/src/db/migrations/
└── 0045_<drizzle-generated-name>.sql
    — adds curricula.order (NOT NULL DEFAULT 0)
    — hand-appended UPDATE: per-subject sequential backfill, ordered by created_at
    — explicitly excludes container curricula from the backfill (container_area_node_id IS NOT NULL)

apps/web/src/curriculum/
├── curriculum-drag-order.ts
│   — reorderAfterDrag(ids, activeId, overId): string[]
│   — pure function: ids with activeId moved to overId's position, everything else keeping relative order
│   — Scenarios 1, 3
└── curriculum-drag-order.test.ts
    — vitest unit tests for reorderAfterDrag
    — covers edge cases: activeId/overId not in ids, activeId === overId, empty list, single item

apps/web/src/subject/
└── subject-section.test.tsx (additions)
    — RTL test: drag-end callback calls reorderCurricula with correctly reordered id list
    — local order state updates synchronously (not waiting for mutation)
    — language-practice subjects render no drag handle (Scenario 7)
    — rejected mutation shows error + reverts local state (Scenario 5b)
```

## Files to modify

```
apps/api/src/db/schema.ts
  — curricula gains: order: integer("order").notNull().default(0)
  — no new indexes for curricula (modules/topics don't have order indexes; issue #70 adds
    topics_curriculum_id_progress_last_interacted_at_idx to topics, not curricula)

apps/api/src/curriculum/curriculum.repo.ts
  — listCurricula() (line 100): add `orderBy(asc(curricula.subjectId), asc(curricula.order))` to query
  — createCurriculum() (line 174): read existing orders in subject; assign `order: nextOrder(...)`
    only if NOT a container (container_area_node_id is null)
  — createSplitOutCurriculum() (line 1522): same order assignment logic
  — NEW: reorderCurricula(subjectId, orderedIds)
    — validates payload id set equals subject's non-container curricula (Scenario 5)
    — writes inside db.transaction(), wrapping a loop over assignOrders()
    — returns { reordered: number } or { error: "invalid_id_set" }

apps/api/src/curriculum/curriculum.controller.ts
  — NEW: handleReorderCurricula(req, res) — readJsonBody → reorderCurricula → success/error response

apps/api/src/router.ts
  — NEW: route name "reorderCurricula" → PATCH /subjects/:id/curricula/order

apps/api/src/server.ts
  — NEW: case "reorderCurricula": return handleReorderCurricula(req, res)

packages/shared/src/curriculum.ts
  — curriculumSchema gains: order: z.number().int()
  — NEW: reorderCurriculaInput = z.object({ orderedIds: z.string().array() })
    (curriculum-owned, mirrors module.ts's reorderInput structurally but lives here per entity-first rule)

apps/web/src/curriculum/board.collection.ts
  — CurriculumRow interface gains: order: number
  — mapCurriculumRow reads it through (line 111–142)

apps/web/src/curriculum/model.ts
  — curriculumSchema gains: order: z.number().int()

apps/web/src/curriculum/curriculum.api.ts
  — NEW: reorderCurricula(subjectId: string, orderedIds: string[]) server-fn

apps/web/src/curriculum/api-client.ts
  — NEW: reorderCurricula(subjectId, orderedIds) → PATCH call to /subjects/:id/curricula/order

apps/web/src/subject/subject-section.tsx
  — DndContext + SortableContext wrapping curricula list (lines ~74–95)
  — Drag handle per curriculum (grip icon, using lucide-react's GripVertical)
  — Local `useState<string[]>` for order state (seeded from props curricula.map(c => c.id))
  — onDragEnd: calls reorderAfterDrag(localIds, activeId, overId), updates local state synchronously
    (so SortableContext sees updated items immediately, no mid-drag snap-back)
  — then calls reorderCurricula inside try/catch (MergeCurriculumButton pattern, not DeleteCurriculumButton's)
  — success: router.invalidate() to sync local state with server response
  — failure: error span + revert local state to pre-drag order (Scenario 5b)
  — language-practice subjects: existing `kind` branch already excludes them (lines ~47–60); verified no change needed

apps/web/src/routes/index.tsx
  — HomeView's curricula-per-subject filter also sorts by order (covers live-sync path)
  — existing filter logic preserved; add sort by order after subject grouping

apps/web/package.json
  — add @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
```

## Acceptance Criteria

1. **Migration proof: 0045 applies, backfill is correct.** `npm run db:migrate -w @post-anki/api` against local Docker Postgres succeeds. Query `SELECT id, subject_id, "order" FROM curricula ORDER BY subject_id, "order"` shows: every non-container curriculum has a distinct `order` per subject, ascending by `created_at`; all container curricula have `order = 0`.

2. **Container curricula are excluded from validation.** Unit test: `reorderCurricula` with a payload that omits one non-container curriculum rejects with `invalid_id_set`; with a payload that includes a container's id rejects with `invalid_id_set`; **in both cases zero rows are modified** (verified by asserting count before/after is unchanged). Write is wrapped in `db.transaction()` — verified by forcing a mid-loop error (simulated DB failure) and asserting zero rows changed, not a partial renumbering.

3. **`listCurricula` returns rows ordered by (subject_id, order).** Vitest mock: insert 3 curricula (sub1, sub2, sub1) with created_at in order A, B, C. `listCurricula()` returns them in order sub1, sub1, sub2, with order values reflecting A<C and B respectively.

4. **New courses join at the back per subject.** Vitest mock: create course A in sub1 (`nextOrder([1,2])` returns 3); create course B in sub2 (`nextOrder([])` returns 1); create course C in sub1 (`nextOrder([1,2,3])` returns 4). Assert A has order 3, B has order 1, C has order 4. Container creates stay at 0.

5. **Validation rejects invalid id sets; write is transactional.** Vitest mock: call `reorderCurricula("sub1", ["wrong_id"])` → reject with `invalid_id_set`. Call with omitted id → reject. Call with foreign subject's id → reject. All with zero rows modified (verified by read before/after).

6. **Pure `reorderAfterDrag` logic proven by unit tests.** Vitest: `reorderAfterDrag(["a","b","c"], "b", "a")` returns `["b","a","c"]` (b moved to a's position). `reorderAfterDrag(["a"], "a", "a")` returns `["a"]` (no-op). Empty list returns empty. ActiveId/overId not present → unchanged input.

7. **Component test: drag-end wiring and error handling.** RTL: render `SubjectSection` with 2 courses, simulate drag-end event (dnd-kit's `handleDragEnd` fired), assert `reorderCurricula` called with correct id order, assert local state updated synchronously. Simulate rejected response → error span visible, local state reverts. Simulate success → router.invalidate() called.

8. **Language-practice subjects render no drag handles.** RTL: render `SubjectSection` with `kind: "language-practice"`, assert no grip icons present. Existing test in `subject-section.test.tsx` already covers the read-side filtering (Scenario 7 bounds); this verifies the drag-side mirrors it.

9. **Live sync: order persists across tabs.** Manual verification (documented in `todo.md`): dev server running, 2 courses under one subject on home page, perform mouse drag to reorder, reload page, confirm new order persists; open second browser tab on same page, confirm live-update to match after drop (Electric syncs the new order column automatically).

10. **Electric shape syncs order unchanged.** Verify shape registry has no impact: open `apps/api/src/electric/electric-shape-registry.ts`, confirm curricula entry has no `columns` allowlist (line 21). Build, start API, request shape with `?table=curricula`, confirm response includes `"order"` column in every row.

## Decisions made autonomously

- **Order required at the schema level, not just UI.** Curricula need persistent, queryable position — display sorting, learner reordering, and live-sync all need a stable order value. A column is the simplest mechanism and matches the existing `modules.order` / `topics.order` precedent.
- **Only one `order` column, no separate `priority` tier.** Unlike modules/topics (which carry both `order` and `priority` for the promote/demote tier), curricula don't need an automated tier — only manual drag reordering. Modules and topics already derive `sortForDisplay` by combining both; curricula will use only `order`, and sortForDisplay is unchanged.
- **Order scoped to "within one subject," not global.** The only grouping the UI already uses. Cross-subject drag would require a different data model (per-subject? global? learner preference?) and UI (how do you drag across section boundaries?). Out of scope; future feature if needed.
- **Validation validates the ENTIRE subject's course set, not just membership.** `reorderCurricula(subjectId, orderedIds)` requires `orderedIds` to exactly match the subject's full set of non-container curricula (same length, no missing, no extra). The old spec noted this is "deliberate hardening beyond `reorderModules` precedent" — `reorderModules` takes any id list and blindly reorders whatever it's given, leaving omitted courses' stale `order` values colliding with the new range. Exact-set matching prevents partial corruption. Cost: one extra read (`SELECT id FROM curricula WHERE subject_id AND container IS NULL`) and a set-equality check — cheap and reversible.
- **Container curricula excluded from reorder operations.** They're plumbing, never shown to learners. Validation query carries the same `container_area_node_id IS NULL` filter `listCurricula` does so the backend's expected set matches what the UI can send. This is the critical bug the advisor caught that the old spec missed.
- **@dnd-kit/core + @dnd-kit/sortable chosen.** No drag-and-drop library exists in `apps/web` today. dnd-kit is actively maintained (latest releases April 2026), hooks-based (React-idiomatic for this codebase), independent of state libraries. Accessible out of the box (KeyboardSensor included).
- **Drag handle, not whole-row drag.** Each curriculum is a link to `/curriculum/$curriculumId` — whole-row drag conflicts with click-to-navigate. Dedicated grip-icon handle (lucide-react's `GripVertical`, already a dependency) placed before the link/badges/buttons.
- **Optimistic local state required.** Originally the old spec planned "no custom optimistic layer, dnd-kit's mid-drag rendering already provides immediacy." Grill-plan found this wrong: `SortableContext.items` drives render order; if it's not updated synchronously in `onDragEnd`, dnd-kit's drop animation snaps the dragged item back to its pre-drag position (since `items` still says that's where it belongs), and the correct position only appears once `router.invalidate()` resolves — a visible snap-back-then-jump, not smooth. Fix: local `useState` holds post-drag order, fires the mutation, re-syncs from props once mutation resolves (or reverts on failure). This matches how `MergeCurriculumButton` already handles its own optimistic UI.
- **Error handling copies `MergeCurriculumButton`, not `DeleteCurriculumButton`.** The delete button (line 121) has zero error handling — a thrown rejection leaves `setBusy(false)` never called and the control stuck disabled. Only `MergeCurriculumButton` (line 137) has working try/catch + an error span. Reorder copies that pattern.
- **Write is wrapped in db.transaction().** `curriculum.repo.ts` already uses `db.transaction()` for other multi-step writes (`clearCurriculumStructure`, `mergeCurricula`). `reorderCurricula` reuses the same pattern instead of a bare loop like `reorderModules`, preventing mid-write process death from leaving some courses renumbered and others stale.
- **Discovered bug: `reorderModules` has zero curriculum scoping.** `apps/api/src/server.ts:255-256` shows `case "reorderModules": return handleReorderModules(req, res)` silently discards the `:id` captured from `/curricula/:id/modules/order` — any caller can reorder modules across curriculum boundaries and the server won't notice. Out of scope for this issue (it's a `modules` bug, not `curricula`), but flagged in `todo.md` and visible in `OPEN-QUESTIONS.md` so it isn't lost. This plan's new endpoint does NOT repeat the mistake (validation query scopes to subject_id).
- **`reorderCurriculaInput` lives in `packages/shared/src/curriculum.ts`, not reused from `module.ts`.** Structurally identical to `reorderInput` (`{ orderedIds }`), but per this codebase's entity-first ownership rule, the curriculum feature owns its own input schema rather than importing from module-owned space.
- **No e2e Playwright test in this pass.** Covered by vitest unit tests on the pure reorder logic and RTL component tests on the drag wiring. A `verification-repo` Playwright e2e test (simulating real mouse drag headlessly) is a genuine, reachable follow-up — tracked in `todo.md`, not a permanent gap. The scope-separation is real: this repo's e2e suite is a separate registered project with its own conventions, authoring a feature there (via `/e2e` or `/write-playwright-tests`) is a distinct unit of work.
- **Architecture doc deferred to post-build `/debrief`.** Per this repo's established convention (see other features in `docs/architecture/`), no pre-build spec is written by the implementation. A post-build `/debrief` pass will write `docs/architecture/course-priority-drag-reorder/` (as-built.mmd + review.md), matching how every other feature here was documented.

## Implementation order

1. `apps/api/src/db/schema.ts` — add `curricula.order`; run drizzle-kit generate; hand-extend migration with per-subject backfill UPDATE (excluding containers).
2. `npm run db:migrate -w @post-anki/api` — apply migration locally.
3. `/tdd reorderAfterDrag` (`apps/web/src/curriculum/curriculum-drag-order.ts`) — pure function + unit tests (Scenarios 1, 3).
4. `packages/shared/src/curriculum.ts` — `order` field + `reorderCurriculaInput`.
5. `apps/api/src/curriculum/curriculum.repo.ts` — `listCurricula()` ORDER BY; `createCurriculum()` and `createSplitOutCurriculum()` assign `nextOrder`; new `reorderCurricula()` (Scenarios 2, 5, 6).
6. `apps/api/src/curriculum/curriculum.controller.ts` — `handleReorderCurricula`.
7. `apps/api/src/router.ts` + `apps/api/src/server.ts` — wire the new route/case.
8. `apps/web/package.json` — add dnd-kit packages; `npm install`.
9. `apps/web/src/curriculum/board.collection.ts` + `model.ts` — `order` field through mapper/schema (Scenario 8).
10. `apps/web/src/curriculum/curriculum.api.ts` + `api-client.ts` — `reorderCurricula` mutation (Scenario 9).
11. `apps/web/src/subject/subject-section.tsx` — drag handle + DndContext/SortableContext + local state + onDragEnd wiring + try/catch error handling (Scenarios 1, 3, 5b, 7); component test.
12. `apps/web/src/routes/index.tsx` — sort-by-order on live-sync path (Scenario 4).
13. Manual verification: dev server, real drag on home page, reload, cross-tab sync (Scenarios 1, 4, 6).

## Definition of Done — per layer

**Backend**
- Vitest unit tests (`curriculum.repo.test.ts`): `reorderCurricula` validates exact-id-set match, excludes containers, writes inside `db.transaction()`, rejects foreign/incomplete ids with zero rows changed. `listCurricula` returns rows ordered by (subject_id, order). `createCurriculum()` and `createSplitOutCurriculum()` assign nextOrder scoped to subject; containers stay at 0.
- Local Postgres: migrate 0045, query curricula ordered by subject, order — every non-container row has distinct order per subject, ascending by created_at; containers at 0.
- HTTP smoke test (manual, curl): `PATCH /subjects/<id>/curricula/order` with valid payload returns 200 and DB reflects new order.

**Frontend**
- Vitest unit tests (`curriculum-drag-order.test.ts`): `reorderAfterDrag` logic proven (move, no-op, edge cases).
- RTL component tests (`subject-section.test.tsx`): drag-end calls mutation with correct order; local state updates synchronously; language-practice renders no handles; rejected response shows error + reverts state.
- Manual verification (documented in `todo.md`): dev server running, 2+ courses under one subject, drag to reorder, reload to confirm persistence; second tab confirms live-sync.

**Infrastructure**
- N/A — no new services, no IaC changes, no deploy pipeline changes.
