---
type: scenarios
branch: 95-gap-skip-visibility
task: "No UI control to mark a topic/gap 'done, stop showing it' despite backend support (#95)"
state: planned
updated: 2026-08-14
---

# Scenarios: Restore the skip/want controls for mastery-tracked gaps (#95)

**8 acceptance criteria.** No migration, no new endpoint — one predicate extraction and one render
condition change in a single existing file, plus tests. Smaller than any recent `.planning/*` entry
in this repo; comparable in size to `.planning/module-reorder-curriculum-scope` (single-file logic
fix) but with no backend surface at all.

No `playwright.md` — this pass's deliverable was scoped to spec/scenarios/todo only (see spec.md
"Explicitly out of scope"); no e2e coverage exists for these controls today in either state, so
nothing in the existing verification-repo suite is affected.

## Master acceptance criteria list (8 items, each independently walkable)

**`isGapActionable` predicate (`topic-row.tsx`, new exported pure function)**

1. `isGapActionable({ status: 'open' })` returns `true` regardless of any mastery field — proven by
   calling it with no `mastery` key present at all (the function only reads `status`).
2. A gap with `status: 'open'` and `mastery.status` of `'new'`, `'practicing'`, or `'struggling'`
   still yields `isGapActionable(gap) === true` — this is the actual bug fix: today's `!mastery` clause
   would have returned `false` for all three.
3. A gap with `status: 'open'` and `mastery.status === 'mastered'` yields `isGapActionable(gap) === true`
   — the predicate is defined purely in terms of `status` and never inspects this combination
   specially. This combination is **not currently reachable** in this codebase: every existing
   `state: "open"` write is a brand-new gap `INSERT`, never a reset of an existing row (spec.md
   Verified facts), and `applyGapMasteryAttempt` early-returns without writing anything once
   `gap_mastery.status` is already `'mastered'` (`gap-mastery.repo.ts:182-194` — "Neither
   `gap_mastery` nor `gaps.state` is written at all here"), so a `mastered`-but-`open` gap would stay
   permanently in that shape if it ever existed, not self-correct on a later attempt. This test case
   exists to pin the predicate's actual, simple definition — not to claim the combination is
   self-healing if some future writer ever produces it.
4. `isGapActionable({ status: 'covered' })` returns `false`, with or without a mastery object attached —
   proven with both a `mastered`-mastery case and a no-mastery `covered` case (a gap can reach
   `covered` via a non-mastery writer, per spec.md's Verified facts), confirming the gate is on
   `status` alone, never on `mastery`.
5. `isGapActionable({ status: 'skipped' })` returns `false` — already unreachable in practice (the
   `skipped` early-return at `topic-row.tsx:411` never calls `GapRow`'s button-rendering branch at
   all), but the predicate itself must still agree for the case where it's called directly in a unit
   test.

**Render-level smoke test (`topic-row.test.tsx`, new file, targets `GapChecklist`)**

`GapRow`'s actual parent is `GapChecklist` (`topic-row.tsx:271-366`, 3 props: `topic`, `curriculumId`,
`hydrated`), not `TopicRow` (9 props, unrelated shape/depth/tag machinery) — see spec.md Decision 3
for why `GapChecklist` is the right, minimal render target and needs one `export` added.

6. Rendering `GapChecklist` (with `hydrated: true`, so `controlState`/`isControlDisabled` doesn't mask
   the result behind the unrelated not-yet-hydrated disabled state) with a topic containing one `open`
   gap that has a `practicing`-status mastery record shows both the "☆ want" and "skip" buttons,
   enabled, for that gap — the regression this whole story exists to fix, proven at the component
   level, not just the predicate level.
7. Rendering `GapChecklist` with a topic containing one `covered` gap (mastery `mastered`) shows
   neither button for that gap, and instead shows the existing mastery-status badge
   (`data-testid="gap-mastery-status-{id}"`) unaffected — proving the fix doesn't touch the
   already-correct terminal-state display.

**Backend confirmation (no new test — cites existing coverage)**

8. A gap with `state: 'skipped'` is excluded from `selectDailyPush`'s candidate pool regardless of
   whether a `gap_mastery` row exists for it — already proven by `packages/core/src/curriculum/
   gap.test.ts`'s existing `inScopeGaps` coverage (filters purely on `g.state !== "skipped"`,
   independent of any mastery field) and unchanged by this plan. No new test needed; cited here so
   issue #95's own "confirmed to actually disappear from their next daily push" criterion is traced
   to a concrete, already-green assertion rather than left as an unverified claim.

---

## SCENARIO 1 — A user quizzed on a gap they've since learned can finally mark it done

**Given** a learner has answered at least one probe question for a gap (a `gap_mastery` row now
exists with `status: 'practicing'`), and the gap itself is still `open`
**When** they view the topic in the curriculum UI
**Then** the "skip" button is visible and clicking it calls `curateGap` with `{ status: 'skipped' }`
exactly as it already does for a never-probed gap — this is the concrete UI path the issue describes
as missing.

Covers AC 2, 6.
Proof: `topic-row.test.tsx` (new render test), `isGapActionable` unit test.

## SCENARIO 2 — A struggling gap still shows the controls, not just a stalled progress badge

**Given** a gap's mastery status is `struggling` (the learner keeps missing it) and `gaps.state` is
still `open`
**When** the topic row renders
**Then** both "want" and "skip" remain available — a learner who's decided they don't care about a
gap they keep failing has the same "stop showing this" escape hatch as one who's about to master it;
the fix doesn't accidentally scope the escape hatch to only the "doing well" mastery states.

Covers AC 2.
Proof: `isGapActionable` unit test (`struggling` case).

## SCENARIO 3 — A mastered/covered gap correctly keeps showing no action buttons

**Given** a gap's mastery status is `mastered` and (per the same atomic write) `gaps.state` is
`covered`
**When** the topic row renders
**Then** no "want"/"skip" buttons appear — only the mastery badge — exactly as today, unchanged by
this fix. Proves the fix is additive (unhides a real gap) and not a regression (doesn't also unhide
buttons on gaps that are genuinely done).

Covers AC 4, 7.
Proof: `topic-row.test.tsx`, `isGapActionable` unit test.

## SCENARIO 4 — Skipping a mastery-tracked gap actually removes it from the next daily push

**Given** a learner skips a gap that has an in-progress `gap_mastery` row (Scenario 1's setup, after
the click)
**When** the next daily push is computed
**Then** `selectDailyPush` never selects that gap — because `gatherPushCandidates` →
`rowToGap` → `inScopeGaps` reads `gaps.state` directly off the row and never consults the
`gap_mastery` sidecar, the skip takes effect on the very first push after the click, with no
mastery-related delay or special case.

Covers AC 8.
Proof: existing `packages/core/src/curriculum/gap.test.ts` (`inScopeGaps` describe block, unmodified)
— no new integration test required; this scenario documents why that existing coverage already
satisfies issue #95's "confirmed to actually disappear" requirement once the button is reachable.
