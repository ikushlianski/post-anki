---
type: scenarios
branch: course-priority-drag-reorder
task: Course-level priority reordering with drag-and-drop manual override (web) — GitHub issue #69
state: confirmed
updated: 2026-07-31
---
<!-- Consistency gate: PASS — promoted from draft to confirmed 2026-07-31. -->
# Scenarios: Course-level priority reordering (drag-and-drop)

## Business Scenarios

SCENARIO 1: Learner drags a course to reorder it within its subject

A learner on the home page (`/`) drags one of their subject's courses above or below
another course in the same subject, drops it, and the new order is what they see from
then on — on that page, and anywhere else their courses are listed by priority.

What to verify:
- Dropping a course between two others places it exactly there, everything else keeps
  its relative order.
- The new order survives a full page reload (persisted server-side, not just local
  React state).
- The Dashboard page (`/dashboard`, the "what am I working on" view) shows courses in
  the same order the learner just set on the home page — both read from the same
  backend ordering.
- Reordering one subject's courses never changes another subject's order.

SCENARIO 2: A newly created course joins at the back of the line

A learner creates a new course in a subject that already has a manually-set order.
The new course appears last — it does not silently jump ahead of courses the learner
already prioritized.

What to verify:
- New course's order value sorts after every existing course in that subject.
- Existing courses' order values are untouched by the creation.

SCENARIO 3: Nothing to drag — zero or one course in a subject

A subject with no courses, or exactly one, shows no functional drag interaction (there
is nothing to reorder against).

What to verify:
- No drag handle renders when a subject has 0 courses (existing "No curricula yet."
  empty state is unchanged).
- A drag handle may render on a single course but dropping it anywhere is a no-op —
  no error, no wasted network call.

SCENARIO 4: Order updates while a second tab is open (live sync)

A learner has the home page open in two browser tabs. They reorder courses in tab A;
tab B — open on the same page, untouched — updates to the new order without a manual
refresh, because course order is a normal Postgres column that flows through the
existing Electric live-sync channel.

What to verify:
- Tab B's `order` values update via the existing `curriculaCollection` live query, no
  new sync plumbing required.
- Tab B's rendered list re-sorts to match, not just the underlying data.

SCENARIO 5: A reorder request that doesn't name exactly the subject's current courses is rejected

The reorder action is scoped to "courses within one subject," and must always
reassign order to the complete set — not just reject foreign ids, but also reject an
incomplete list. If a request's id list contains a course id that does not belong to
the target subject (a stray client bug, a forged request, or a race with a delete),
or omits a course that currently belongs to that subject (a stale client render, a
race with another tab's create/delete), the whole request is rejected — no partial
write that could scramble another subject's order, silently drop a course from the
list, or leave some courses re-numbered 1..N while others keep stale order values
that now collide with the new range.

What to verify:
- Endpoint validates every id in the payload belongs to the subject named in the URL,
  AND that the payload's id set exactly matches that subject's current full set of
  course ids (same length, no missing, no extra) — before writing anything.
- On any mismatch: no rows are updated (all-or-nothing), and the learner sees an
  error rather than a silently wrong or partially-renumbered order.

SCENARIO 5b: A reorder is rejected because another tab changed the list mid-drag (legitimate race, not a bad actor)

Unlike Scenario 5's malicious/buggy framing, this is an ordinary use of the app's own
live-sync feature: a learner starts dragging in tab A while, in tab B (or the same
tab, moments earlier), a course in that same subject got created or deleted. The
drag-list tab A rendered its ids from is now stale by the time the drop fires, so the
exact-set-match check (Scenario 5) rejects the request — correctly, since writing it
anyway would silently drop or duplicate a course. The learner must not see nothing
happen; they see a clear message and the list refreshes to the current state so they
can just drag again.

What to verify:
- On a rejected reorder, the UI shows a visible error (not a silently stuck or
  no-op control) — the reorder mutation's error handling follows the working
  try/catch + visible error message pattern already used by `MergeCurriculumButton`
  in `subject-section.tsx`, not the pattern used by `DeleteCurriculumButton`/
  `DeleteSubjectButton` in the same file, which swallow a thrown rejection and leave
  the control stuck disabled with no message.
- After the error, `router.invalidate()` runs so the learner's next drag starts from
  the current, correct list.

SCENARIO 6: Pre-existing courses get a sane order the first time this ships

Before this feature exists, no course has an order value. The migration that adds the
column must not leave every existing course tied at the same value with no defined
tiebreaker — the first time a learner opens a subject after this ships, the order they
see should already make sense (their courses in the order they were originally
created), not an arbitrary shuffle.

What to verify:
- Every pre-existing course gets a distinct order value per subject, ascending by the
  course's original creation time.
- A subject's first course, migrated, sorts before its second, etc.

SCENARIO 7: Reordering does not appear on non-course-list subjects

A subject of kind `language-practice` doesn't show a courses list at all today (it
shows an "Open practice" link instead). This feature does not add a drag list there —
there's nothing to reorder.

What to verify:
- `language-practice` subjects render exactly as they do today; no drag affordance
  appears.

## Technical/Architectural Scenarios

SCENARIO 8: New `order` column flows through Electric sync with no shape change

The `curricula` Electric shape (`apps/web/src/routes/api.electric-shape.ts`) has no
column allowlist for the `curricula` table (unlike the `sources` shape, which does
filter columns) — so a new `order` column on the Postgres table is synced to clients
automatically once it exists, without touching the shape route.

What to verify:
- No changes needed to `api.electric-shape.ts` for the `curricula` table entry.
- `CurriculumRow`/`mapCurriculumRow` in `board.collection.ts` and the `Curriculum` zod
  schema in `apps/web/src/curriculum/model.ts` are updated to read the new column —
  the shape itself needs no code change, only the client-side row mapper.

SCENARIO 9: Reorder write path is a normal PATCH, not an Electric write

The drag-and-drop mutation writes through the existing PATCH-endpoint pattern (same
shape as `reorderModules`), landing in Postgres directly — Electric is read-only sync
here, exactly as it already is for every other curricula mutation (create, delete,
merge, status change all go through PATCH/POST/DELETE endpoints today, not through
Electric).

What to verify:
- `reorderCurricula` mutation is a plain server-fn → HTTP PATCH → repo function, same
  chain as every other curriculum mutation already in `curriculum.api.ts`.
