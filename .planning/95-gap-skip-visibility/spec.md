---
type: spec
branch: 95-gap-skip-visibility
task: "No UI control to mark a topic/gap 'done, stop showing it' despite backend support (#95)"
complexity: simple
state: planned
updated: 2026-08-14
verification:
  targetDb: none (no schema/DB change — one render-condition fix in apps/web)
---

# Plan: Restore the skip/want controls for mastery-tracked gaps (#95)

## What this story is, in one paragraph

`GapRow` (`apps/web/src/curriculum/topic-row.tsx:461`) only renders the "want"/"skip" buttons when
`gap.status === 'open' && !mastery`. `gap.mastery` is populated the moment a gap is answered even
once — `applyGapMasteryAttempt` (`apps/api/src/gap/gap-mastery.repo.ts:146-253`) inserts the sidecar
`gap_mastery` row unconditionally on the first scored attempt, called from every answered probe via
`probe-session.service.ts:195`. `gaps.state` (the field surfaced as `gap.status`) only flips to
`covered` once mastery reaches `mastered`, in the same DB transaction
(`gap-mastery.repo.ts:243-245`). Net effect: any gap the user has been quizzed on at least once but
hasn't yet mastered — the common, ongoing case for an actively-studied topic — has no UI path to
"stop showing this," even though the backend (`handleCurateGap`, `apps/api/src/gap/
gap.controller.ts:83-113`) applies `state: 'skipped'` unconditionally, with no mastery gating at all.
This plan is a one-condition UI fix: drop `&& !mastery` from the render guard, add unit coverage for
the resulting state × mastery matrix, and confirm the fix requires no backend change.

## Verified facts (independently re-checked against current code)

- **`gaps.state` (`gap.status` in the web model) is a 3-value enum: `open | covered | skipped`**
  (`apps/web/src/curriculum/model.ts:129`, mirrored server-side —
  `apps/api/src/db/schema.ts:506` comment: "keeps `gaps.state`'s existing 3-value enum"). The only
  terminal states are `covered` and `skipped`. `open` is the sole non-terminal state, so gating the
  controls on `gap.status === 'open'` alone already excludes both terminal states — no need to also
  inspect `mastery.status`.
- **`triage_state` (#29/#33's `untriaged | important | user_deferred | dismissed | auto_deferred`) is
  a fully separate column, orthogonal to `gaps.state`** — confirmed directly in
  `apps/api/src/db/schema.ts:484` ("`state` (open|covered|skipped) is completely untouched by any of
  this — triage is an orthogonal concept layered on top") and `gap-triage.repo.ts`. The issue's own
  "Note" asked whether #29's triage states end up covering this case naturally — they don't; `#95`
  stays a genuinely separate fix. This plan does not gate on `triage_state` anywhere, and "dismissed"
  (a triage value) is not the same thing as "covered" (a `gaps.state` value) — the task brief's
  shorthand "covered/dismissed" conflates the two columns; this plan treats only `gaps.state`'s
  `covered`/`skipped` as terminal.
- **The mastery→`covered` flip is one-directional and not the only writer of `gaps.state`.** The
  sidecar comment at `topic-row.tsx:368-373` and `schema.ts:506-514` both note that
  `probe.service.ts`, `socratic.service.ts` (including its give-up path), and
  `probe-session.service.ts`'s own pre-existing single-verdict cover can all independently write
  `gaps.state`, so a gap can read `covered` while `gap_mastery.status` is not `mastered`, or vice
  versa is prevented only by the one atomic transaction cited above. **This is exactly why the fix
  gates on `gap.status` alone, not on any mastery field**: `gaps.state` is the one column every
  scheduling/selection path actually reads (see next point), so it is the only column that should
  gate the control that promises "stop showing this."
- **The backend selection path that daily push relies on already excludes `skipped` gaps
  independent of mastery — confirmed end-to-end, not assumed:**
  `inScopeGaps` (`packages/core/src/curriculum/gap.ts:27-31`) filters purely on
  `g.state !== "skipped"`. Its input comes from `gatherPushCandidates`
  (`apps/api/src/push/push.repo.ts:9-46`), which reads raw `gaps` rows and maps them via `rowToGap`
  (`apps/api/src/gap/gap.repo.ts:29-52`), whose own preceding comment (lines 22-27) states plainly:
  "`state` itself is left completely untouched here" — i.e. `rowToGap` never derives or overrides
  `state` from the `gap_mastery` sidecar. So a mastery-tracked gap that gets `state: 'skipped'` via `handleCurateGap`
  is excluded from `selectDailyPush` on the very next push, exactly like a never-probed skipped gap
  is today. **This confirms the fix is genuinely UI-only** — issue #95's own "Done when" ("confirmed
  to actually disappear from their next daily push") already holds once the button is reachable.
- **No writer resets an already-terminal gap's `gaps.state` back to `open` while its mastery status
  remains `mastered`.** Every `state: "open" as const` write in `apps/api/src` (`gap.controller.ts:52`,
  `gap.repo.ts:131`, `slice-generation.orchestrator.ts:303`) is a brand-new gap `INSERT`, not a reset
  of an existing row — checked directly, not assumed, since a resurface-from-`covered` writer would
  have reintroduced a case where `gap.status === 'open'` and `mastery.status === 'mastered'`
  disagree. No such writer exists today, so gating on `gap.status === 'open'` alone is safe with the
  current codebase's set of writers.
- **The `want` ("★ wanted"/"☆ want") button shares the exact same render guard as `skip`** — both
  sit inside the same `{gap.status === 'open' && !mastery ? (...) : null}` block
  (`topic-row.tsx:461-482`). Fixing the shared condition restores both controls together; there is no
  separate bug or separate fix for `want`.
- **The `skipped` early-return (`topic-row.tsx:411-417`) is untouched by this plan** — it already
  renders a plain "· skipped" line with no buttons at all, for the exact same reason `covered` should
  hide the buttons: once terminal, the control has nothing left to do. Un-skipping is not requested
  by the issue and is out of scope.
- **No cards-related file is touched.** `git status --short` (2026-08-14) confirms
  `packages/shared/src/cards.ts`, `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`, and
  `apps/api/src/topic/topic.repo.ts` all carry pre-existing uncommitted WIP; none of this plan's files
  overlap them.
- **No existing test locks in the buggy behavior.** `topic-row.tsx` has no test file today
  (`find apps/web/src/curriculum -iname "*topic-row*"` returns only the source file), and no
  verification-repo action/test references the skip or want controls
  (`grep -rln "skip\|want" /Users/ikushlianski/work/verification-repo/projects/post-anki/post-anki/features/curriculum/` finds only an unrelated seed file). The fix has nothing to un-pin.
- **post-anki is a registered verification-repo project** (`/Users/ikushlianski/work/
  verification-repo/projects/post-anki/`), and this fix does touch `apps/web`. Unlike
  `.planning/22-voice-responses` (which justified skipping a `playwright.md` because its surface
  never touched `apps/web`), that reasoning doesn't automatically apply here. This plan's own
  deliverable set was scoped by the requesting task to `{spec.md, scenarios.md, todo.md}` only, so no
  `playwright.md` is produced in this pass — logged as a decision in todo.md, not silently dropped,
  since whoever implements this may want to run it through `/plan-playwright` or add a
  `/write-playwright-tests` pass given no e2e coverage exists for these controls in either state.

## Decision 1 — Gating condition: `gap.status === 'open'`, drop `&& !mastery` entirely

Not "hide once `mastery.status === 'mastered'`" (which would require reading a second field and
duplicating logic `gaps.state` already encodes), and not "hide unless in `{covered, dismissed}`"
(the task brief's own phrasing, corrected above — `dismissed` isn't a `gaps.state` value at all).
The condition becomes simply:

```tsx
{gap.status === 'open' ? (
  <span className="flex shrink-0 items-center gap-2 text-neutral-400">
    {/* want / skip buttons, unchanged */}
  </span>
) : null}
```

This is the minimal, correct fix: `gap.status === 'open'` is already the single source of truth for
"not yet terminal" (see Verified facts), so no compound condition is needed. In the implementation
this condition is expressed via `isGapActionable(gap)` (Decision 2), not written inline.

## Decision 2 — Extract the predicate as a small, named, unit-tested function

Per this repo's CLAUDE.md convention ("extract testable logic into small sync functions; test
them"), the condition is pulled into a pure, exported function in `topic-row.tsx` (co-located, not a
new file — it's a short predicate with no other consumer). Named `isGapActionable`, not
`canCurateGap` — a `covered` gap can still legitimately be curated via `handleCurateGap` (it accepts
`depth`/`wanted`/`concern` patches regardless of `state`), so "can this gap be curated" would be the
wrong name for what the predicate actually answers: "is this gap still in a non-terminal state that
warrants showing the want/skip controls at all."

```tsx
export function isGapActionable(gap: Pick<Gap, 'status' | 'mastery'>): boolean {
  return gap.status === 'open'
}
```

The parameter type deliberately still accepts `mastery` (typed as `Pick<Gap, 'status' | 'mastery'>`,
not just `Pick<Gap, 'status'>`) even though the body never reads it — this keeps "mastery is
irrelevant to this decision" visible and type-checkable at every call site, including the unit tests
in scenarios.md that pass a `mastery` object specifically to prove it's ignored. `GapRow` calls
`isGapActionable(gap)` in place of the old inline condition. This gives the fix an exhaustive, fast,
DB-free test surface (see scenarios.md) instead of relying only on a heavier component-render test
to prove every state × mastery combination.

## Decision 3 — Test shape: exhaustive unit coverage on the predicate, two thin render assertions

`GapRow`'s actual parent is `GapChecklist` (`topic-row.tsx:271-366`), not `TopicRow` itself —
`TopicRow` (`topic-row.tsx:43`) takes nine props and pulls in `DepthSlider`, `TagPicker`,
`TopicShapeBar`, `SelfGrade`, `NodeCommentControl`, `InlineRename`, none of which this fix touches.
`GapChecklist` is the tightly-scoped component that actually maps `topic.gaps` to `<GapRow>` and
owns `useCurateGap`, taking only three props (`topic`, `curriculumId`, `hydrated`) — the right render
target for this fix's test, not `TopicRow`. `GapChecklist` is not currently exported; this plan adds
`export` to its declaration (a one-line, zero-behavior-change addition) so it's directly testable,
matching this repo's existing pattern of testing the smallest component that owns the behavior
under test rather than a large parent.

`GapChecklist` pulls in `useRouter` (`@tanstack/react-router`) and `useCurateGap`
(`@tanstack/react-query`), so its render test needs a provider harness. That harness already has a
same-folder precedent — `apps/web/src/curriculum/curriculum-structure-chat.test.tsx:1-16` wraps
renders in `QueryClientProvider` and mocks `useRouter`/`Link` from `@tanstack/react-router` via
`vi.mock`. This plan reuses that exact pattern rather than inventing a new one, but keeps it to two
thin smoke-level assertions (buttons appear for an open+mastery-tracked gap, disappear for a covered
one) — the exhaustive state × mastery matrix belongs on `isGapActionable` directly, where it's cheap
and has no rendering/mocking overhead at all.

## Architecture

### Business logic changes

- A user who has been quizzed on a gap at least once — the common case for any topic they're
  actively studying — now has a working "skip" control to say "I know this, stop surfacing it," and
  a working "want" control to (de)prioritize it. Today that control silently vanishes the moment the
  first probe answer is scored, with no user-visible explanation.
- A gap marked skipped this way is excluded from the very next daily push, exactly as issue #95's
  "Done when" requires — this was already true at the backend level; the fix only makes the control
  reachable.
- No change to gaps that have already reached `covered` (mastered) or `skipped` — those still show no
  action buttons, since there is nothing left to curate on a terminal gap.

### Architectural changes

- None. No schema change, no new endpoint, no new column read. `apps/web/src/curriculum/
  topic-row.tsx` gains one small exported pure function (`isGapActionable`), a one-line change to its
  call site, and one `export` added to the previously-unexported `GapChecklist` component so it's
  directly render-testable; no other file changes.

## Quality gates

1. `npx tsc --noEmit` clean across `apps/web`.
2. `npx vitest run` green — new `isGapActionable` unit coverage (exhaustive over `status × mastery`,
   see scenarios.md) plus the two new render-level smoke tests in a new
   `apps/web/src/curriculum/topic-row.test.tsx`.
3. No repo-wide ESLint (per `.planning/33-untriaged-gaps-auto-defer/spec.md`'s already-verified
   finding, still true) — the typecheck gate is the lint gate.
4. No `npm run test:integration` gate — nothing in this story touches the database, and the backend
   push-selection path is already covered by existing tests on `inScopeGaps`/`selectDailyPush`
   (`packages/core/src/curriculum/gap.test.ts`, `daily-push.test.ts`), unmodified by this plan.

## Explicitly out of scope

- Any backend change — `handleCurateGap`, `applyGapMasteryAttempt`, `inScopeGaps`, and
  `selectDailyPush` are all already correct and are confirmed unmodified by this plan (see Verified
  facts).
- Un-skipping a gap from the UI, or any control on the already-terminal `covered`/`skipped` rows —
  not requested by #95, and the `skipped` early-return already deliberately shows no buttons.
- Gating on `triage_state` (#29/#33) in any way — confirmed orthogonal, not touched.
- A `playwright.md` / verification-repo test pass — no e2e coverage exists for these controls today
  in either the buggy or fixed state, so nothing regresses; adding coverage is logged as a follow-up
  in todo.md, not built in this pass (this pass's deliverable was scoped to spec/scenarios/todo only).
- Any file carrying pre-existing cards-related WIP (`packages/shared/src/cards.ts`,
  `apps/api/src/cards/`, `apps/api/src/mastra/mastra.ts`, `apps/api/src/topic/topic.repo.ts`).
