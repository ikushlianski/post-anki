# Phase 1 report — due-today review queue (backend)

Verdict: **shipped**. Backend for the cross-subject due-today queue is implemented, typechecks
cleanly, and passes the core unit-test suite. Phase 2 (frontend `/today` list UI) is intentionally
out of scope for this phase.

## What was built

A new read-only view of "everything due for review today", as a concept separate from the existing
single-pick daily push. `selectDailyPush` is untouched and still returns exactly one `DailyPushPick`
(the session opener); `selectDueQueue` returns the full ranked list of every eligible gap.

- `packages/core/src/curriculum/daily-push.ts:108` — `selectDueQueue(candidates, now): DueQueueItem[]`.
  Reuses the same eligibility filter `selectDailyPush` uses
  (`openGaps(c.gaps, c.depth).filter((gap) => !isPushExcluded(gap, now))`), then returns *every*
  eligible item instead of only the top pick.
- `packages/core/src/curriculum/daily-push.ts:26` — `DueQueueItem` type, identical in shape to the
  non-null arm of `DailyPushPick` (`topicId`, `topicTitle`, `curriculumId`, `curriculumName`, `gap`,
  `reason`).
- `apps/api/src/push/push.controller.ts:46` — `handleDueQueue(res)`: calls `gatherPushCandidates()`
  (unchanged, already cross-subject), then `selectDueQueue`, and responds with `{ items }`.
- `packages/shared/src/daily-push.ts:44-52` — `dueQueueItemSchema` (aliases the existing
  `dailyPushSchema`), `DueQueueItem`, `dueQueueResponseSchema` (`{ items: DueQueueItem[] }`), and
  `DueQueueResponse`.
- `apps/api/src/router-table.ts:111` — `GET /due-queue` route, mirroring the `GET /daily-push`
  wiring through `router.ts` (`"dueQueue"` in the `RouteName` union) and `server.ts` (import + case).

## Design decisions

- **Returns every eligible item, not just the top pick.** The queue is a list view, so unlike
  `selectDailyPush` (which tiers `important` → `wanted` → `weakest` and discards lower tiers), the
  queue keeps every gap that passes the eligibility filter. A merely-`wanted` gap still appears even
  when an `important` gap exists elsewhere; each item is tagged with its own reason.
- **Ranking.** Items are sorted so that the head of the queue always matches `selectDailyPush`'s
  single pick: `important`-triaged gaps first, then `wanted`, then depth-proximity (the same
  `rank(gap.depth) - rank(candidate.depth)` tie-break `selectDailyPush` uses). The reason field is
  assigned with the same `important` → `wanted` → `weakest` ternary.
- **Refresh fallback.** When no open gap is eligible anywhere, stale `covered` gaps (≥90 days since
  `lastEvaluatedAt`) surface as `reason: "refresh"` items, ordered oldest-first — the same rule
  `selectDailyPush` applies. Note: this fallback is applied globally (only when the open pool is
  empty overall), matching `selectDailyPush`'s own behavior, rather than per-candidate; flag for
  review if the intent was that a topic with no open gaps should still surface its stale gaps even
  while other topics have open gaps.

## What was verified and how

- `npx tsc --noEmit -p packages/shared` — exit 0.
- `npx tsc --noEmit -p packages/core` — exit 0.
- `npx tsc --noEmit -p apps/api` — exit 0.
- `npx vitest run` in `packages/core` — 109 files, 963 tests passed. The `selectDueQueue` describe
  block (7 tests in `packages/core/src/curriculum/daily-push.test.ts`) covers: every eligible gap
  across multiple subjects appears; ranking matches `selectDailyPush`'s tie-break with the pick as
  the head; important-first ordering; an empty list when nothing is eligible; refresh fallback; and
  dismissal/deferral exclusions.

## Notes

- A second agent (PID 27135) was found running this same Phase 1 prompt in the same checkout and
  authored most of the file edits; this report reflects the settled final state, which I verified
  end-to-end after its last write. That agent had not produced its own report by the time this was
  written. No files were committed or pushed, per the dispatch.
