---
type: spec
branch: module-reorder-curriculum-scope
task: Close the missing curriculum-scoping check on module reordering (issue #75)
complexity: simple
state: confirmed
updated: 2026-08-13
---

# Spec: Module reorder curriculum-scoping check

### What to do

`PATCH /curricula/:id/modules/order` (issue #75, `priority:highest`) captures the curriculum id
from the URL but never uses it. `route()` in `apps/api/src/server.ts:273` calls
`handleReorderModules(req, res)` — dropping the `id` the router already resolved — unlike the
sibling `createModule` route one line below, which passes it through
(`handleCreateModule(req, res, id)`, `server.ts:275`). `handleReorderModules`
(`apps/api/src/module/module.controller.ts`) forwards the body's `orderedIds` straight to
`reorderModules(orderedIds)` (`apps/api/src/module/module.repo.ts`), which updates
`modules.order` for every id given with no ownership check at all. Any caller who knows module ids
from a different curriculum can splice them into the payload and move them into this curriculum's
ordering, corrupting both curricula's `order` sequences.

### Verified against real code (correcting the PM's brief)

- **The threading gap is exactly as described.** Confirmed by reading `server.ts:271-277`,
  `module.controller.ts`, and `module.repo.ts` directly — not taken on the PM's word.
- **"A proven fix pattern already exists from issue #69" is not quite right — the fix for #69
  exists but was never merged.** `git log --grep` finds `75f0e35` ("Add course priority reordering
  and cross-course refocus suggestions … Closes #69"), which adds `reorderCurricula(subjectId,
  orderedIds)` in `curriculum.repo.ts` with exactly this shape. But
  `git merge-base --is-ancestor 75f0e35 HEAD` returns false: that commit lives only on the
  `course-priority-drag-reorder` branch, which forked from an older commit (`dd704de`) that current
  `main` has since moved 45 commits past (including an unrelated curriculum/domain-node decoupling
  pass). The pattern is real and well-reasoned — its own code comment even names `reorderModules`
  as the exact precedent it's hardening beyond — but it has never landed on `main`, so this plan
  reimplements it against modules rather than cherry-picking a merge.
- **The validation is exact-set, not subset.** `reorderCurricula`'s comment explains why: `assignOrders`
  (`packages/core/src/curriculum/ordering.ts`) reassigns `1..N` sequentially to only the ids it's
  given. A subset check (every id in the payload belongs to this curriculum) would let a caller
  submit a partial list and leave the omitted modules' stale `order` values colliding with the
  newly-assigned `1..N` range. The check must confirm the payload's id set is exactly the
  curriculum's current full set of module ids — same size, none missing, none extra.
- **Confirmed the frontend already sends the full set, so an exact-set check is not a regression.**
  `apps/web/src/routes/curriculum.$curriculumId.tsx:71` builds `moduleOrder` from
  `detail.modules.map(m => m.id)` — the full, unfiltered module list for the curriculum — and
  `module-section.tsx`/`shape-controls.tsx`'s `moveInOrder` only reorders within that same full
  array before calling `reorderModules(curriculumId, orderedIds)`
  (`apps/web/src/curriculum/api-client.ts:863`). No frontend change is required.
- **No schema or migration implication.** `modules.curriculumId` already exists and is `NOT NULL`
  (`apps/api/src/db/schema.ts`); `createModule` already scopes `nextOrder` per curriculum the same
  way `reorderCurricula` scopes per subject. This is a pure application-layer fix.
- **`router.ts` and `router.test.ts` need no change.** The route already captures `id` correctly
  (`{ method: "PATCH", pattern: /^\/curricula\/([^/]+)\/modules\/order$/, name: "reorderModules",
  param: "id" }`) and `router.test.ts:97-100` already asserts it resolves — the bug is purely that
  `server.ts` discards the captured id before use.
- **`packages/shared/src/module.ts`'s `reorderInput` needs no change.** The scoping id comes from
  the URL, not the body, and `reorderInput` is shared with `handleReorderTopics` — editing it would
  touch a second, out-of-scope endpoint for no reason.

### The exact validation logic (mirrors `reorderCurricula`, `curriculum.repo.ts:180-209` on the
unmerged branch)

```ts
export type ReorderModulesError = "invalid_id_set";

export async function reorderModules(
  curriculumId: string,
  orderedIds: string[],
): Promise<{ error: ReorderModulesError } | { reordered: number }> {
  const db = getDb();

  const existing = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.curriculumId, curriculumId));

  const existingIds = new Set(existing.map((r) => r.id));
  const payloadIds = new Set(orderedIds);

  const exactMatch =
    existingIds.size === payloadIds.size &&
    orderedIds.length === payloadIds.size &&
    [...existingIds].every((id) => payloadIds.has(id));

  if (!exactMatch) {
    return { error: "invalid_id_set" };
  }

  await db.transaction(async (tx) => {
    for (const { id, order } of assignOrders(orderedIds)) {
      await tx.update(modules).set({ order }).where(eq(modules.id, id));
    }
  });

  return { reordered: orderedIds.length };
}
```

`handleReorderModules` gains a `curriculumId: string` parameter (same position `handleCreateModule`
already uses), passes it to `reorderModules`, and returns `400 { error: "invalid_id_set" }` when the
repo call reports the mismatch — same response shape `handleMergeCurricula`/other repo-error
handlers already use elsewhere in this codebase.

### Files to touch

```
apps/api/src/server.ts                    — line 273: handleReorderModules(req, res, id)
apps/api/src/module/module.controller.ts  — handleReorderModules(req, res, curriculumId): read
                                             curriculumId, pass through, map { error } to 400
apps/api/src/module/module.repo.ts        — reorderModules(curriculumId, orderedIds): exact-set
                                             check + db.transaction (was an unwrapped loop with no
                                             curriculumId param at all)
apps/api/src/module/
  module-reorder-curriculum-scope.integration.test.ts — new, see Test plan below
```

### Files NOT touched (confirm explicitly)

- `apps/api/src/router.ts`, `apps/api/src/router.test.ts` — route already correct.
- `packages/shared/src/module.ts` — `reorderInput` unchanged, shared with `reorderTopics`.
- `apps/web/` — frontend already sends the full module-id set; no change needed.
- `apps/api/src/topic/topic.repo.ts`, `topic.controller.ts` — `reorderTopics` has the identical
  defect (no `moduleId` scoping check) but is not in issue #75's scope. Flagged below as a
  follow-up, not fixed here.
- No new migration — `modules.curriculumId` and `modules.order` already exist.

### Scope boundary

Out of scope for this plan, worth its own follow-up issue: `PATCH /modules/:id/topics/order`
(`reorderTopics`) has the exact same shape of bug — `handleReorderTopics` in
`topic.controller.ts` never receives the module id the router captures, and
`topic.repo.ts`'s `reorderTopics(orderedIds)` validates nothing against `topics.moduleId`. Once this
plan's `reorderModules` shape lands, the topics fix is a direct copy (swap `curriculumId`/`modules`
for `moduleId`/`topics`), not a redesign — worth calling out to whoever picks it up next so it isn't
re-derived from scratch.

### Test plan

New file: `apps/api/src/module/module-reorder-curriculum-scope.integration.test.ts`, following the
existing real-Postgres integration convention (`curriculum-move.integration.test.ts` is the closest
precedent in this codebase — dedicated throwaway database via `assertLocalDbTarget` +
`CREATE DATABASE`/migrate/`DROP DATABASE`, raw `pg` client for fixture inserts, repo function
imported after `DATABASE_URL` is set). `describe("reorderModules")`, business-intent `it` names:

1. **`"reorders every module when the payload is exactly this curriculum's module set"`** — insert
   two curricula (A, B), 3 modules under A, 2 under B; call `reorderModules(curriculumAId,
   [a3, a1, a2])`; assert the repo call returns `{ reordered: 3 }` and A's modules now have `order`
   1/2/3 matching the new sequence (query the real rows), and B's modules' `order` values are
   untouched.
2. **`"rejects a payload that smuggles another curriculum's module id and changes nothing"`** — same
   fixture; call `reorderModules(curriculumAId, [a1, a2, b1])` (B's module id spliced in, one of A's
   own ids omitted); assert the result is `{ error: "invalid_id_set" }` and every module's `order` —
   in both curriculum A and curriculum B — is unchanged from its seeded value (zero rows touched, not
   just "some rejected").
3. **`"rejects an incomplete payload that omits one of the curriculum's own modules"`** — same
   fixture; call `reorderModules(curriculumAId, [a1, a2])` (valid ids, but missing `a3`); assert
   `{ error: "invalid_id_set" }` and no `order` values change — this is the case the PM's brief
   ("validate each module's curriculumId") would have let through, since every id in that partial
   payload does belong to curriculum A.

### Definition of Done

**Backend** (only real layer — no frontend or infrastructure changes, see "Files NOT touched")

- `npx tsc --noEmit` clean in `apps/api`.
- `npm run e2e:db:up` running locally, then:
  `npm run test:integration -w @post-anki/api -- apps/api/src/module/module-reorder-curriculum-scope.integration.test.ts`
  passes all three cases above. (Not `npx vitest run <path>` directly — this project's
  `vitest.integration.config.ts` is deliberately excluded from the default config and this vitest's
  `--exclude` is additive-only, so a bare `vitest run` on an `*.integration.test.ts` path silently
  matches zero tests and reports a false green; see that config file's own comment.)
- `npx vitest run` (default config) still green — no existing test touches `reorderModules`, so this
  is a regression guard, not new coverage.
- Manual/API-level check: a `curl PATCH /curricula/:id/modules/order` with a foreign module id now
  returns `400 { "error": "invalid_id_set" }` instead of silently reordering.

**Frontend** — N/A, unchanged (confirmed above).

**Infrastructure** — N/A, no schema/migration change.

### Risk and effort verdict

Confirms the PM's assessment, with one correction: this is a straightforward, low-risk,
backend-only, single-PR fix — not because a merged precedent exists to copy (it doesn't), but
because the schema and frontend already support the exact-set check with zero downstream changes,
and the design being copied (from the unmerged `course-priority-drag-reorder` branch) is small,
already reasoned through, and directly analogous (subject→curricula becomes curriculum→modules).
Effort: one repo function rewrite, one controller signature change, one `server.ts` line, one new
integration test file. No migration, no frontend change, no other route touched.
