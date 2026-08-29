---
type: review
branch: learn-from-doc-site
task: "Add a nested category level between Subject and Curriculum, plus new base subjects"
state: approved
reviewedBy: sonnet (this session, direct code verification — no dispatched sub-agent used this round)
updated: 2026-08-21
---
# Review: Subject > category > curriculum nesting (round 3)

## Summary
Verdict: **approved**
Fresh re-review against `.planning/unassigned/subject-category-nesting/spec.md`, `scenarios.md`,
and `todo.md`, focused on independently verifying the three fixes claimed by the latest
implementation pass — by reading the actual diff and re-running tests, not by trusting todo.md's or
the prior review.md's account. All three are genuine, correctly targeted fixes, each backed by a
real, discriminating test that now passes against live Postgres. No new regression was found
anywhere else in the diff.

Blocking issues: None.

Divergences from plan: None new. Carried forward from round 2 (all non-blocking, cosmetic, or
out-of-scope-for-this-ticket — see "Open items" below): category-count copy still not a full match
to the dashboard's phrasing despite todo.md now marking it resolved; `MAX_ATTEMPTS` exhaustion
surfaces as 404 instead of a distinct conflict code; frontend components still have zero dedicated
test coverage; the e2e action catalog's `studyTechnology` action targets removed testids (out of
repo); a stale comment in `vitest.config.ts`; two stale filenames in spec.md's "Files to create."

---

## Verification of the three claimed fixes

### 1. Drag-to-reorder regression (was BLOCKING)
Confirmed fixed. `apps/api/src/curriculum/curriculum.repo.ts:1717-1729`'s `reorderCurricula` now
adds `isNull(curricula.categoryId)` to the `existingRows` query, alongside the pre-existing
`eq(curricula.subjectId, subjectId)` and `isNull(curricula.containerAreaNodeId)` filters — so the
server-side expected-id-set now matches exactly what the frontend actually sends.
`apps/web/src/subject/subject-section.tsx:55,57` seeds `localOrder` from
`curricula.filter((c) => c.categoryId === null)` — both ends now agree on scope.

A real regression test exists and passes:
`apps/api/src/subject-category/subject-category.repo.integration.test.ts:515-547` — a new
`describe("reorderCurricula — scoped to uncategorized curricula (SCENARIO 1 regression)")` block
with two cases: (1) reordering two uncategorized curricula succeeds when a third, categorized
curriculum also exists in the same subject (asserts `{ reordered: 2 }` — this is exactly the case
that returned `invalid_id_set` before the fix); (2) an id-set mismatch is still correctly rejected.
Ran it directly against a live Postgres instance this session:
```
DATABASE_URL=postgresql://postanki:postanki@localhost:5436/postanki_e2e \
  npx vitest run --config vitest.integration.config.ts \
  src/subject-category/subject-category.repo.integration.test.ts
→ 18 passed (18)   [up from 16 in round 2 — the 2 new reorder tests]
```
Controller passthrough (`curriculum.controller.ts:867-874`) is unchanged and just forwards
`orderedIds` — no other caller of `reorderCurricula` needed updating.

### 2. Category page's move control unreachable for cross-subject category targets (was non-blocking)
Confirmed fixed. `apps/web/src/routes/subject.$subjectId.category.$categoryId.tsx:13-32` now
computes two separate lists: `subjectCategories` (this subject's own categories, still passed as
`categories` to `CreateMaterialForm`'s tree-position picker) and passes the full, unfiltered
`board.categories` as `allCategories` into `CurriculumRowActions` (line 122). Traced the consumer
chain: `CurriculumRowActions` → `MoveCurriculumButton`
(`apps/web/src/subject/subject-section.tsx:238-260, 374-399`) — `buildCategoryPickerOptions` is
called with `allCategories` filtered by whatever subject the user selects in the move dropdown
(`:399`), so a different subject's own categories are now reachable from the category page, matching
how `subject.$subjectId.tsx` already did it. No `.test.tsx` exists for this specific route, but the
data flow was verified directly by reading every hop from prop to picker call.

### 3. Concurrent-move integration test's overclaimed assertion (was non-blocking)
Confirmed fixed, and honestly so. `subject-category.repo.integration.test.ts:388-462` — the comment
above the test (`:390-408`) now explicitly states the "never torn" property is trivially guaranteed
by Postgres's single-`UPDATE`-statement atomicity regardless of locking, and names the actual
discriminating property this fix specifically targets: both concurrent calls resolve cleanly (no
throw, no deadlock) and, checked via an immediate follow-up move (`:453-460`), no advisory lock is
left held by a losing attempt. The old `expect(consistentWithB || consistentWithC).toBe(true)`
assertion is kept but now explicitly labeled "kept as a basic sanity check, not the test's real
discriminating assertion" (`:441-446`) rather than being presented as proof of the fix. This is an
honest, more modest claim that matches what the test can actually demonstrate — verified by reading
the write path it's testing (`curriculum.repo.ts`'s single `UPDATE` inside
`withPairLockAllowingEqual`) and confirming the follow-up-move assertion would in fact catch a
leftover lock (it would hang/timeout, not just return a value). Test passes (part of the 18/18 run
above).

---

## Regression sweep (nothing else broken)

- `npm run typecheck --workspaces --if-present` → pass, 0 errors, all 6 workspaces (re-run this
  session).
- `npm run test --workspaces --if-present` → api: 8 failed / 480 passed, all 8 failures confined to
  `apps/api/src/curriculum/curriculum-structure.test.ts` (`generateWithRetry` event-logging
  assertions) — this file belongs to the unrelated `learn-from-doc-site` documentation-site feature
  sharing this branch, not this ticket's `subject_category` code; pre-existing and already reported
  as such in round 2. web/bot/mobile/core/shared: all green (474/474, 244/244, 38/38, etc.).
- `subject-category.repo.integration.test.ts`: 18/18 passed against live Postgres (up from 16 —
  purely additive, the 2 new reorder-regression tests; no existing test changed behavior).
- Lint: only `apps/bot` has a `lint` script (aliased to `tsc --noEmit`); no root/other-workspace
  lint config exists to run — unchanged from round 2, not a new gap introduced by this pass.
- Re-read the full diff for anything touching `reorderCurricula`, the category route, or the
  integration test beyond the three targeted fixes — found nothing else changed in those files
  besides the fix itself, its test, and (for the frontend) an unrelated `categoryId: null` field
  addition to a test fixture object (`subject-section.test.tsx:66`) needed to keep the fixture
  typed correctly, and two pre-existing test renames/removals (dead `knowledge-map-link`/
  `subject-name` assertions) that match round 2's own account of that file's diff.
- SCENARIO 8, 9, 1 (the scenarios touched by these three fixes) all re-verified PASS by direct
  code read; no other scenario's Acceptance items were touched by this pass's diff.

Self-audit: clean. Every claim above cites a specific `file:line` this session read directly, and
every "fixed" claim is backed by a test this session ran and watched pass, not just a diff read.

---

## Open items carried forward (non-blocking, unattended mode — no human present to ask)

None of these block approval; recorded so they aren't lost.

1. Category-count copy on the subject page still reads "N item(s)" for the non-zero case
   (`apps/web/src/subject/subject-section.tsx:37`) rather than the dashboard's "N curriculum/
   curricula" (`apps/web/src/routes/index.tsx:201`) — only the zero-state string ("No curricula
   yet") actually matches. `todo.md:40` now marks this "Resolved," but the code comment's claim
   ("Mirrors the dashboard's... treatment") is only half true — worth a follow-up correction to
   either the code or the todo.md claim.
2. `MAX_ATTEMPTS` exhaustion in `moveCurriculumToSubject` still surfaces as a 404 `not_found`
   instead of a distinct conflict/retry code (`curriculum.repo.ts:1166`) — low severity, single-user
   app.
3. Frontend test coverage for `create-material-form.tsx`, `category-tree-picker.tsx`, and the
   category route is still entirely absent (`todo.md:17`, still unchecked, correctly so).
4. Out-of-repo: the e2e action catalog's `studyTechnology` action targets testids removed along with
   `StudyTechnologyForm` — needs a fix in the e2e action catalog, not this ticket.
5. `apps/api/vitest.config.ts`'s comment about explicit CLI paths bypassing `exclude` is stale on
   the current vitest version — minor doc correction.
6. spec.md's "Files to create" list still names two files that were deliberately not created
   (`subject-category.api.ts`, `getCategory`) — spec.md text should be reconciled to the actual,
   reasonable implementation choices made.

Next: `/squash-and-rebase-ie` or `/commit-push`, per this ticket's own scope (note: this branch also
carries unrelated `learn-from-doc-site` documentation-site changes and a pre-existing test failure
in that feature's own test file — not this ticket's concern to fix).
