# Cross-subject due-today review queue

## What and why

`/today` currently surfaces exactly one item (`selectDailyPush`, single `DailyPushPick`) as "the
session opener" — deliberate, per `.product/GLOSSARY.md`. There is no way to see everything that's
actually due for review today across every subject at once. This adds a real list, as a genuinely
separate concept from daily push (not a rename or a second cadence — `.product/REJECTED.md` and
`DECISIONS.md` already rejected extra cadences beyond daily push + on-demand; this is a *view*, not
a new push mechanism).

## Phases

### Phase 1: Backend — selectDueQueue + endpoint
Goal: a pure function returning every eligible gap ranked (not just the top one), exposed via a new
GET endpoint.
Key files:
- `packages/core/src/curriculum/daily-push.ts` — add `export type DueQueueItem = { topicId, topicTitle, curriculumId, curriculumName, gap, reason }` (same shape as the non-null arm of `DailyPushPick`) and `export function selectDueQueue(candidates: PushCandidate[], now: string): DueQueueItem[]`. Reuse the exact same eligibility filter `openGaps(c.gaps, c.depth).filter((gap) => !isPushExcluded(gap, now))` and the same `important`/`wanted`/`weakest` reason logic `selectDailyPush` already uses — but return every eligible item, ranked, not just `ranked[0]`. Also include the `refresh` (stale, ≥90 days) items when the important/wanted/weakest pool is otherwise empty for a given candidate, same rule `selectDailyPush` applies. Do not modify `selectDailyPush` itself — it stays exactly as-is (`DailyPushPick`, single pick).
- `apps/api/src/push/push.controller.ts` — add `handleDueQueue(res)`: calls `gatherPushCandidates()` (already cross-subject, unchanged), then `selectDueQueue(candidates, now)`, returns `{ items: DueQueueItem[] }` as JSON.
- `packages/shared/src/` — add the `DueQueueItem`/response Zod schema alongside the existing `DailyPushResponse` schema (same file that already defines it — check `packages/shared/src/curriculum.ts` or wherever `DailyPushResponse`/`DailyPushReason` live).
- `apps/api/src/router-table.ts`, `router.ts`, `server.ts` — wire `GET /due-queue` the same way `GET /daily-push` is already wired (find that route's 3-file wiring and mirror it exactly).

### Phase 2: Frontend — list UI on /today
Goal: a "Due today" list section on the existing `/today` page, alongside the current single-pick card.
Key files:
- `apps/web/src/curriculum/curriculum.api.ts` (or wherever `getDailyPush` lives) — add `getDueQueue` calling the new endpoint.
- `apps/web/src/routes/today.tsx` — load `getDueQueue()` in the existing `Promise.all` loader alongside `getDailyPush`/nudges/openQuestions. Render a new list section (own heading "Due today", separate from the single-pick card below it — do not merge the two concepts into one UI element). Each row: topic title, curriculum name, reason badge (reuse `REASON_LABEL`), links to `/curriculum/$curriculumId`. Empty state (zero due items) renders an explicit `data-testid="due-queue-empty"` marker, not nothing — same convention `OpenQuestionsBanner` already uses on this same page. Non-empty state: `data-testid="due-queue-list"` on the container, `data-testid="due-queue-item-<topicId>"` per row.
- User-facing — write a RED Playwright test first per `.claude/skills/shared/e2e-conventions-personal.md`, scenario: "the /today page lists every gap due today across more than one subject, not just the single daily-push pick."

## Constraints and risks
- Must not touch or rename `selectDailyPush`/`DailyPushPick` — that stays the session-opener, unchanged, per `.product/GLOSSARY.md`.
- Must not introduce a new push/notification cadence — this is a passive list a user reads when they open `/today`, not a new trigger.
- `gatherPushCandidates()` already excludes dormant curricula and filters to `included` topics — reuse it as-is, don't re-implement that filtering.
