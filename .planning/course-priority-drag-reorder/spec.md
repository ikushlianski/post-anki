---
type: spec
branch: course-priority-drag-reorder
task: Course-level priority reordering with drag-and-drop manual override (web) — GitHub issue #69
complexity: complex
state: confirmed
updated: 2026-07-31
---
<!-- Consistency gate: PASS (all 10 checks, check 10 N/A — no BAML involvement) — promoted from draft to confirmed 2026-07-31. -->
# Spec: Course-level priority reordering (drag-and-drop)

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Data model + ordering deriver | 2, 6, 8 | Migration: `curricula.order` column + per-subject backfill; `packages/core` reused as-is (no new deriver there) | New pure fn `reorderAfterDrag` in `apps/web/src/curriculum/curriculum-drag-order.ts` + unit tests | None | N/A (migration + unit-tested) |
| 2 — Backend reorder path | 1, 2, 5, 9 | `reorderCurricula` repo fn (subject-scoped, validates ids); `handleReorderCurricula` controller; new router entry `PATCH /subjects/:id/curricula/order`; `listCurricula()` gains `ORDER BY subject_id, order`; `createCurriculum()` assigns `nextOrder` scoped to subject | None (consumes Phase 1) | Phase 1 | No added latency — same query shape, one more column |
| 3 — Web frontend | 1, 3, 4, 7, 8 | None (consumes Phase 2) | `@dnd-kit/*` added to `apps/web`; `subject-section.tsx` gets drag handles + `DndContext`/`SortableContext`; `board.collection.ts` + `model.ts` read the new `order` column; `index.tsx`'s `HomeView` sorts by `order` for the live-sync path; `curriculum.api.ts` + `api-client.ts` get `reorderCurricula` | Phases 1–2 | Drag feels instant (dnd-kit's own local rendering mid-drag); persisted order lands after drop, no added round trip beyond the existing invalidate-after-mutation pattern |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `reorderAfterDrag` (`apps/web/src/curriculum/curriculum-drag-order.ts`) | `ids: string[]`, `activeId: string`, `overId: string` | `string[]` — `ids` with `activeId` moved to sit where `overId` was, everything else keeping relative order; returns `ids` unchanged if `activeId`/`overId` aren't both present or are equal | 1, 3 |
| `assignOrders` (`packages/core/src/curriculum/ordering.ts`) — reused, not modified | `orderedIds: string[]` | `Array<{ id, order }>`, sequential from 1 | 1, 2 |
| `nextOrder` (`packages/core/src/curriculum/ordering.ts`) — reused, not modified | `existing: number[]` | next integer order value | 2 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| 1 — Drag reorders within a subject | `apps/api/src/curriculum/curriculum.repo.ts` (`reorderCurricula`), `apps/api/src/curriculum/curriculum.controller.ts` (`handleReorderCurricula`), `apps/api/src/router.ts`, `apps/api/src/server.ts` | `apps/web/src/subject/subject-section.tsx`, `apps/web/src/curriculum/curriculum-drag-order.ts`, `apps/web/src/curriculum/curriculum.api.ts`, `apps/web/src/curriculum/api-client.ts` | None |
| 2 — New course joins at the back | `apps/api/src/curriculum/curriculum.repo.ts` (`createCurriculum`) | None | None |
| 3 — Zero/one course, no functional drag | None | `apps/web/src/subject/subject-section.tsx` | None |
| 4 — Live sync across tabs | None (Electric already syncs all columns) | `apps/web/src/curriculum/board.collection.ts`, `apps/web/src/routes/index.tsx` | None |
| 5 — Foreign or incomplete id set rejected | `apps/api/src/curriculum/curriculum.repo.ts` (`reorderCurricula`, wrapped in `db.transaction`), `apps/api/src/curriculum/curriculum.controller.ts` | None | None |
| 5b — Rejection surfaces visibly, not silently | None | `apps/web/src/subject/subject-section.tsx` (reorder error handling, `MergeCurriculumButton`-style try/catch, not `DeleteCurriculumButton`-style) | None |
| 6 — Pre-existing courses get sane order | `apps/api/src/db/schema.ts`, new migration file under `apps/api/src/db/migrations/` | None | None |
| 7 — No reorder UI on `language-practice` subjects | None | `apps/web/src/subject/subject-section.tsx` (no change needed — existing `kind` branch already excludes this path; verified by a component test) | None |
| 8 — `order` flows through Electric shape unchanged | None (`api.electric-shape.ts` untouched — confirmed no column allowlist for `curricula`) | `apps/web/src/curriculum/board.collection.ts`, `apps/web/src/curriculum/model.ts` | None |
| 9 — Reorder is a normal PATCH, not an Electric write | `apps/api/src/curriculum/curriculum.controller.ts`, `apps/api/src/router.ts` | `apps/web/src/curriculum/curriculum.api.ts`, `apps/web/src/curriculum/api-client.ts` | None |

### Files to create

```
apps/api/src/db/migrations/
└── 00XX_<drizzle-generated-name>.sql   — adds curricula.order + per-subject backfill UPDATE

apps/web/src/curriculum/
└── curriculum-drag-order.ts            — reorderAfterDrag pure fn
└── curriculum-drag-order.test.ts       — vitest coverage for reorderAfterDrag

apps/web/src/subject/
└── subject-section.test.tsx            — RTL test: drag-end callback calls reorderCurricula
                                           with the correctly reordered id list; language-practice
                                           subjects render no drag affordance
```

### Files to modify

```
apps/api/src/db/schema.ts                          — curricula gains order: integer().notNull().default(0)
apps/api/src/curriculum/curriculum.repo.ts          — listCurricula() ORDER BY subject_id, order;
                                                        createCurriculum() assigns nextOrder scoped to
                                                        subject; new reorderCurricula(subjectId, orderedIds)
                                                        — validates exact id-set match, writes inside
                                                        db.transaction() (matches this file's existing
                                                        clearCurriculumStructure/mergeCurricula pattern,
                                                        not reorderModules's unwrapped loop)
apps/api/src/curriculum/curriculum.controller.ts    — new handleReorderCurricula
apps/api/src/router.ts                              — new RouteName "reorderCurricula" +
                                                        PATCH /subjects/:id/curricula/order
apps/api/src/server.ts                              — import + switch case for reorderCurricula
packages/shared/src/curriculum.ts                   — curriculumSchema gains order: z.number().int();
                                                        new reorderCurriculaInput = z.object({ orderedIds })
                                                        (curriculum-owned, not reused from module.ts —
                                                        see Decisions below)

apps/web/src/curriculum/board.collection.ts         — CurriculumRow gains order: number;
                                                        mapCurriculumRow reads it through
apps/web/src/curriculum/model.ts                    — Curriculum zod schema gains order: z.number().int()
apps/web/src/curriculum/curriculum.api.ts            — new reorderCurricula server-fn
apps/web/src/curriculum/api-client.ts               — new reorderCurricula(subjectId, orderedIds) PATCH call
apps/web/src/subject/subject-section.tsx             — DndContext/SortableContext + drag handle per
                                                         curriculum row; local order state (seeded from
                                                         props, updated synchronously in onDragEnd via
                                                         reorderAfterDrag) drives SortableContext's items
                                                         so the drop doesn't snap back before the mutation
                                                         resolves; onDragEnd then calls reorderCurricula
                                                         inside try/catch (MergeCurriculumButton's
                                                         pattern, not DeleteCurriculumButton's) — success
                                                         re-syncs from props via router.invalidate(),
                                                         failure shows a visible error and reverts local
                                                         state to the pre-drag order
apps/web/src/routes/index.tsx                        — HomeView's curricula-per-subject filter also
                                                         sorts by order (covers the live-sync path)
apps/web/package.json                                — add @dnd-kit/core, @dnd-kit/sortable,
                                                         @dnd-kit/utilities
```

### Data model changes

`curricula` table gains one column:

```
order: integer("order").notNull().default(0)
```

Same shape as the existing `modules.order`/`topics.order` precedent. Migration
generated via `drizzle-kit generate`, then hand-appended (same file, same pattern
already used for other backfills in this migrations folder) with a one-time `UPDATE`
that assigns a distinct sequential value per subject, ordered by `created_at` — see
`architecture.md`'s "Data model evolution" for the exact SQL. Applied only via this
repo's existing `npm run db:migrate -w @post-anki/api` — never pushed directly, per
the constitution's migration rule.

### Documentation changes

This repo's `docs/architecture/` convention is a flat, per-feature layout (e.g.
`docs/architecture/topic-ordering-importance.md`, `docs/architecture/domain-priority-review/`,
`docs/architecture/curriculum-merge/`) generated post-build by the `/debrief` skill —
not the domain/component-split taxonomy the generic constitution rule describes as its
default, and this repo has never used that taxonomy. Per the constitution's own
"local rules extend, not override" precedence, and because inventing a new taxonomy
unilaterally on an unattended run isn't a safe default, this plan follows the
established local convention instead: no architecture doc is written by this plan
itself. Once built, running `/debrief` on this feature will write
`docs/architecture/course-priority-drag-reorder/` (an `as-built.mmd` + `review.md`,
consistent with every other entry in that folder) — that step is intentionally left
for after implementation, matching how every other feature in this list was
documented.

### Decisions made autonomously

- **Migration required, not just a UI gap.** `curricula` has no `order`/`priority`
  column today (verified directly in `apps/api/src/db/schema.ts`) — this is the
  larger-scope branch of the issue's own conditional.
- **Only an `order` column, no separate `priority` tier.** `modules`/`topics` carry
  both `order` (position) and `priority` (-1/0/1 promote/demote tier, combined via
  `sortForDisplay`). The issue asks specifically for manual drag reordering, not an
  automated promote/demote tier — adding an unused `priority` column now would be
  speculative scope. Reused `assignOrders`/`nextOrder` (already generic, entity-
  agnostic pure functions) without touching `sortForDisplay`.
- **Reorder scoped to "courses within one subject," not global or cross-subject.**
  Matches how `SubjectSection` already partitions curricula by subject; cross-subject
  drag is out of scope (see Scope boundary).
  - Rationale for the whole plan hinging on this, not asked as a question: it's the
    only grouping that already exists anywhere in the UI curricula are shown in.
- **New endpoint validates the payload's id set is EXACTLY the subject's current full
  set of course ids** (Scenario 5) — not just "every id belongs to the subject," but
  same length, no missing, no extra. A deliberate hardening beyond the
  `reorderModules` precedent (confirmed by reading `module.controller.ts`'s
  `handleReorderModules`: it takes no curriculum-id parameter at all and blindly
  reorders whatever module ids are given, with zero scoping check) — and beyond a
  membership-only check, because `assignOrders` reassigns 1..N only to the ids it's
  given; an incomplete list would leave the omitted courses' stale `order` values
  colliding with the newly-assigned range. The fix is one extra read (`SELECT id FROM
  curricula WHERE subject_id = ?`) and a set-equality check before the write loop —
  cheap and reversible.
- **`@dnd-kit/core` + `@dnd-kit/sortable` (+ `@dnd-kit/utilities`) chosen over
  alternatives.** No drag-and-drop library exists anywhere in `apps/web` today.
  Verified via web search (2026-07-31): actively maintained (releases into April
  2026, ~2.8M weekly downloads), hooks-based (matches this codebase's React-idiomatic
  patterns), no dependency on a specific state-management library. The dnd-kit
  *documentation* repo was archived Feb 2026 — the library packages were not; this
  does not disqualify it under the project's "no unmaintained dependencies" rule.
- **Drag handle, not whole-row drag.** Each curriculum `<li>` currently wraps a
  `Link` to `/curriculum/$curriculumId` — making the whole row draggable would
  conflict with click-to-navigate. Default: a dedicated grip-icon handle (using
  `lucide-react`'s `GripVertical`, already a dependency) placed before the existing
  link/badges/buttons row.
- **Keyboard sensor included alongside pointer sensor.** dnd-kit's
  `KeyboardSensor` + `sortableKeyboardCoordinates` is effectively free once
  `@dnd-kit/sortable` is already a dependency — included for accessibility rather
  than treated as a follow-up.
- **Reversed after grill-plan: reorder DOES need local optimistic state, unlike
  delete/merge/status-change.** Originally decided "no custom optimistic layer,
  dnd-kit's mid-drag rendering already provides the perceived immediacy" — grill-plan
  correctly challenged this: `SortableContext`'s `items` prop has to be the actual
  array driving render order, and if that array isn't updated the instant
  `onDragEnd` fires, dnd-kit's own drop animation snaps the dragged item back to its
  pre-drag slot (since `items` still says that's where it belongs), and the correct
  position only reappears once `router.invalidate()` resolves — a visible
  snap-back-then-jump, not the instant feel the Definition of Done claims. Fix:
  `subject-section.tsx` holds the post-drag order in local state (`useState`, seeded
  from props, updated synchronously in `onDragEnd` via `reorderAfterDrag`) as the
  `items`/render source, fires the mutation, and only re-syncs from props once
  `router.invalidate()` resolves (or reverts local state on a rejected request — see
  Scenario 5b). Delete/merge/status-change still need no such layer — they don't
  drive a dnd-kit `SortableContext`.
- **Reorder mutation's error handling explicitly follows `MergeCurriculumButton`'s
  try/catch + visible error pattern, not `DeleteCurriculumButton`'s.** Grill-plan
  found `DeleteCurriculumButton`/`DeleteSubjectButton` in `subject-section.tsx` have
  no `try/catch` at all — a thrown rejection leaves `setBusy(false)` never called and
  the control stuck disabled with no message. Blindly "following the same pattern"
  as originally decided would have copied the broken variant onto exactly the path
  (Scenario 5/5b) most likely to actually throw. Only `MergeCurriculumButton` has
  working try/catch + an error span; the reorder handler copies that one.
- **`reorderCurricula`'s write loop is wrapped in `db.transaction()`, not a bare
  sequential loop like `reorderModules`.** Originally planned to mirror
  `reorderModules`'s unwrapped `for` loop of individual `db.update()` calls exactly.
  Grill-plan found `curriculum.repo.ts` (the file this function lands in) already
  uses `db.transaction(async (tx) => {...})` for other multi-step writes (see
  `clearCurriculumStructure` and `mergeCurricula`) — reusing the unsafe loop here
  would mean a mid-write process death leaves some courses renumbered 1..N and
  others holding stale `order` values that collide with the new range: the exact
  corrupted state Scenario 5's validation exists to prevent, just triggered by a
  write failure instead of a bad payload. Fix costs nothing beyond the pattern this
  file already uses elsewhere.
- **Discovered, not fixed here: `reorderModules` has zero curriculum-scoping.**
  Grill-plan confirmed `apps/api/src/server.ts:255-256`
  (`case "reorderModules": return handleReorderModules(req, res)`) silently discards
  the `:id` the router captures from `/curricula/:id/modules/order` — any caller can
  reorder modules across curriculum boundaries today and the server won't notice.
  Out of scope for this issue (it's a `modules` bug, not a `curricula` one) but
  flagged here and in `todo.md` so it isn't lost; this plan's new endpoint does not
  repeat the mistake (see the exact-set-match decision above).
- **Accepted, pre-existing, not introduced by this plan: `createCurriculum`'s
  `nextOrder` assignment has the same unlocked read-then-write race
  `createModule`'s does today** (read existing orders, compute max+1, no
  transaction/lock). Two courses created in the same subject at nearly the same
  moment could tie on `order`. Not fixed here — it's inherited from an existing,
  already-shipped pattern, and a tie is self-healing (any later drag reorder
  reassigns clean sequential values; a tie doesn't crash anything, it just
  tie-breaks arbitrarily until then).
- **`reorderCurriculaInput` lives in `packages/shared/src/curriculum.ts`, not reused
  from `packages/shared/src/module.ts`'s `reorderInput`.** Structurally identical
  (`{ orderedIds: string[] }`), but per this codebase's entity-first ownership rule,
  the curriculum feature owns its own input schema rather than reaching into a
  module-owned file for a same-shaped type.
- **No e2e test authored in this pass — corrected reasoning after grill-plan.**
  Originally justified as "this worktree cannot reach `verification-repo`," which
  grill-plan checked and found false: `verification-repo` exists on disk and is
  reachable, and Playwright can simulate a drag gesture headlessly (mouse
  move/down/up or `dragAndDrop`) without a real display — so "no real browser
  interaction possible" was not an accurate blocker. The honest reason is scope: this
  repo's e2e suite is a separate registered project (`projects/post-anki/post-anki/`
  in `verification-repo`, see `e2e/README.md`) with its own action/fixture/config
  conventions, and authoring a new registered feature there (via `/e2e` or
  `/write-playwright-tests`) is a distinct unit of work from this plan's build —
  bundling it into this pass risks under-scoping both. Covered in this pass instead
  by a vitest unit test on the pure reorder logic and an RTL component test on the
  drag-end wiring (including the error-path from Scenario 5b), plus a documented
  manual verification step (see Definition of Done). A real Playwright e2e test in
  `verification-repo` is a genuine, reachable follow-up — tracked in `todo.md`, not
  a permanent gap.
- **`docs/architecture/` update deferred to post-build `/debrief`**, per this repo's
  established convention (see Documentation changes above) rather than writing a
  pre-build architecture doc that doesn't match how any other feature here was
  documented.
- **Auto-confirmed without human review** — this is an unattended/overnight run;
  the recommended-default rule was applied throughout instead of pausing for
  interview rounds, a fresh-eyes grill-plan pass (via a forked subagent with no
  access to this planning conversation) was run and its findings incorporated
  before confirming, and the consistency gate passed all 10 checks (check 10 N/A —
  no BAML involvement). Every decision above is reversible and pattern-following.
  Plan auto-confirmed by grand-loop (no human present to review) — consistency
  gate passed with 0 gaps.

### Implementation order

1. `apps/api/src/db/schema.ts` — add `curricula.order`; generate + hand-extend
   migration (backfill UPDATE); run `npm run db:migrate -w @post-anki/api` locally.
2. `/tdd reorderAfterDrag` (`apps/web/src/curriculum/curriculum-drag-order.ts`) —
   covers Scenarios 1, 3.
3. `packages/shared/src/curriculum.ts` — `order` field + `reorderCurriculaInput`.
4. `apps/api/src/curriculum/curriculum.repo.ts` — `listCurricula()` `ORDER BY`;
   `createCurriculum()` `nextOrder` scoping; `reorderCurricula()` with exact-id-set
   validation, writes wrapped in `db.transaction()` — covers Scenarios 2, 5, 6.
5. `apps/api/src/curriculum/curriculum.controller.ts` — `handleReorderCurricula`.
6. `apps/api/src/router.ts` + `apps/api/src/server.ts` — wire the new route/case.
7. `apps/web/package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`,
   `@dnd-kit/utilities`; install.
8. `apps/web/src/curriculum/board.collection.ts` + `model.ts` — `order` field
   through the row mapper and zod schema — covers Scenario 8.
9. `apps/web/src/curriculum/curriculum.api.ts` + `api-client.ts` — `reorderCurricula`
   mutation — covers Scenario 9.
10. `apps/web/src/subject/subject-section.tsx` — drag handle, `DndContext`/
    `SortableContext` backed by local order state, `onDragEnd` wiring with
    try/catch error handling + revert-on-failure, `language-practice` exclusion
    unchanged — covers Scenarios 1, 3, 5b, 7; component test.
11. `apps/web/src/routes/index.tsx` — sort-by-order on the live-sync path — covers
    Scenario 4.
12. Manual verification pass (see Definition of Done) — Scenario 1, 4, 6 end-to-end.

### Scope boundary

- Cross-subject drag (dragging a course from one subject's list into another) is out
  of scope — reorder is confined to "within one subject," matching the only grouping
  the UI already uses.
- No separate `priority` tier (promote/demote) for curricula — only manual `order`.
- No automated e2e Playwright test in `verification-repo` — deferred, tracked in
  `todo.md`.
- `apps/mobile` is untouched — this is a web-only (`apps/web`) issue; the mobile app
  is a separate codebase with its own `CLAUDE.md`.
- `language-practice`-kind subjects are unaffected — they never render a curricula
  list today and continue not to.
- No new `docs/architecture/` file written by this plan — deferred to a post-build
  `/debrief` pass, per this repo's established documentation convention.

### Definition of Done — per layer

**Backend**
- Migration proof: run `npm run db:migrate -w @post-anki/api` against local Docker
  Postgres, then `psql -c "SELECT id, subject_id, \"order\" FROM curricula ORDER BY subject_id, \"order\";"`
  — every pre-existing row has a distinct `order` per subject, ascending by
  `created_at` (Scenario 6).
- `npx vitest run apps/api/src/curriculum/curriculum.repo.test.ts` (new/extended
  test file) — asserts `reorderCurricula` rejects a payload containing an id from a
  different subject, and separately rejects a payload that omits one of the
  subject's existing course ids, in both cases writing zero rows (Scenario 5), that
  the write path runs inside `db.transaction()` (assert via a forced mid-loop
  failure leaving zero rows changed, not a partial renumbering), and that
  `listCurricula()` returns rows ordered by `(subjectId, order)`.
- `curl -X PATCH localhost:8030/subjects/<id>/curricula/order -d '{"orderedIds":[...]}'`
  against a locally running API returns 200 and the DB reflects the new order — manual
  check, documented in `todo.md`, since this repo has no HTTP-level API test harness
  outside the e2e stack.

**Frontend**
- `npx vitest run apps/web/src/curriculum/curriculum-drag-order.test.ts` — pure
  function proof for Scenario 1/3 reorder logic (this is the part that can be fully
  automated without a real browser).
- `npx vitest run apps/web/src/subject/subject-section.test.tsx` — RTL test proving
  the `onDragEnd` handler, given a simulated drag-end event, calls the
  `reorderCurricula` mutation with the correctly reordered id list and updates local
  render order synchronously (not only after the mutation resolves — Scenario 1);
  that a `language-practice` subject renders no drag handle (Scenario 7); and that a
  rejected mutation shows a visible error and reverts local order to the pre-drag
  state rather than leaving the control stuck or silently wrong (Scenario 5b).
- Manual verification (documented in `todo.md`, not automatable headlessly — no real
  browser drag gesture is available in this build environment): with the dev server
  running (`npm run dev`) and at least two courses under one subject on the home page,
  perform an actual mouse drag to reorder them, reload the page, and confirm the new
  order persists; open a second browser tab on the same page and confirm it live-
  updates to match after the drop (Scenario 4); open `/dashboard` and confirm it
  shows the same order (Scenario 1).
- No automated e2e Playwright test added in this pass (see Decisions/Scope boundary)
  — a `verification-repo` follow-up is the documented gap, not silently skipped.

**Infrastructure**
- N/A — not touched. No new services, no IaC changes, no deploy pipeline changes.
  The only "infra-adjacent" artifact is the Postgres migration, which is covered
  under Backend above.
