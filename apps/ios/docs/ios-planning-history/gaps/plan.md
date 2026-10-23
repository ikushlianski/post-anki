# Gaps: list, add, curate, triage, resurfacing

## Goal
Covers the single coding task in `.planning/gaps/todo.md`: see a topic's knowledge gaps, add one, mark it wanted, skip or reopen it, triage it (important, later, dismiss, revisit), and see deferred gaps that are due to come back. Mirrors web `apps/web/src/curriculum/topic-row.tsx` (gap curation: "Add a gap you want covered...", "wanted" toggle, skip) and the resurfacing block on web's today page (`apps/web/src/routes/today.tsx:175-210`).

Batch 1, built fourth (last). Owns the full `Gap` model.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/quiz-sessions/plan.md`. Dispatch: `apps/api/src/api-server.ts:599-600` and `api-server.ts:628-639`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /topics/:id/gaps` | `apps/api/src/router-table.ts:270`, `apps/api/src/topic/topic.controller.ts:37-49` | none | `[Gap]` | 404 `not_found` |
| `POST /gaps` | `router-table.ts:293`, `apps/api/src/gap/gap.controller.ts:23-81` | `{ topicId, label (min 1), depth?, wanted?: Bool (default true), concern? }` (`packages/shared/src/gap.ts:124`) | **201** `Gap` with `origin: "user"` | 400, 404 |
| `PATCH /gaps/:id` | `router-table.ts:303`, `gap.controller.ts:83-126` | `{ state?: "open"|"covered"|"skipped", wanted?: Bool, depth?, concern?: String or null }` (`gap.ts:134`) | `Gap` | 400, 404 |
| `POST /gaps/:id/triage` | `router-table.ts:296`, `gap.controller.ts:132-155` | `{ action: "important"|"defer"|"dismiss"|"revisit" }` (`gap.ts:32-36`) | `{ gap: Gap, changed: Bool, tool }` (`gap.ts:102`) | 400, 404 |
| `GET /gaps/due-for-resurface` | `router-table.ts:294`, `gap.controller.ts:157-165` | none | `{ userDeferredDue: [{ gap, tool }], dismissedCheckinDue: [{ gap, tool }] }` (`gap.ts:110-117`); read-only | none |

Shapes:
- `Gap` (`gap.ts:71`): `{ id, topicId, label, depth, origin: "ai"|"user", state: "open"|"covered"|"skipped", wanted: Bool, concern: String?, lastEvaluatedAt?, mastery: { status: "new"|"practicing"|"struggling"|"mastered", masteryStage, correctCountInCycle, incorrectCountInCycle }?, triageState: "untriaged"|"important"|"user_deferred"|"auto_deferred"|"dismissed", triagedAt?, deferredUntil?, deferralCount, dismissedAt?, dismissedCheckinSentAt?, untriagedSince, autoDeferredAt? }`. When `mastery` is present, its status is the one shown.
- `concern` values: security, performance, observability, cost, reliability, developer_experience.
- Triage rules (`packages/core/src/gap/gap-triage.ts`): "defer" pushes it out 60 days; `changed: false` for no-ops (already important, a live deferral, revisit on an untriaged gap). `tool` is decoded as an opaque optional string and not shown.

## Dropped
- `POST /gaps/:id/mark-resurfaced` (`gap.controller.ts:167`): called by the bot after it sends the reminder; calling it from the app would mark a reminder as sent when none was.
- `POST /gaps/auto-defer-sweep` (`gap.controller.ts:189`, `router-table.ts:295`): scheduler sweep.
- `/gap-mastery/cross-cutting-nudge`: not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/GapModels.swift` (~70 lines): `Gap`, `GapMastery`, `DeclareGapInput`, `CurateGapInput`, `TriageGapInput`, `TriageGapResult`, `GapResurfaceItem`, `GapsDueForResurface`. `Gap*` names are reserved for batch 1.
- `API/APIClient+Gaps.swift` (~55 lines): `topicGaps(topicId:)`, `declareGap(_:)`, `curateGap(id:_:)`, `triageGap(id:action:)`, `gapsDueForResurface()`. Own file-private path helpers.
- `TopicGapsModel.swift` (~110 lines), `TopicGapsScreen.swift` (~160 lines), `GapRow.swift` (~90 lines).
- `AddGapSheet.swift` (~70 lines).
- `ResurfacingGapsModel.swift` (~50 lines), `ResurfacingGapsScreen.swift` (~90 lines).

## Screens and behaviour

### Entry
- `TopicStudyModesSection` (batch 1): row "Gaps" (`list.bullet.clipboard`) pushing `TopicGapsScreen(topic:)`.
- `HomeStudyModesSection` (batch 1): row "Gaps coming back" (`arrow.uturn.backward.circle`) pushing `ResurfacingGapsScreen()`.

### Topic gaps (`TopicGapsModel`, `TopicGapsScreen`, `GapRow`)
- Sections "Open" (state open, important first, then wanted, then label), "Later" (user_deferred / auto_deferred, with "Back on <date>" via `DueReviewModel.nextDueText(_:)`), "Dismissed", "Covered or skipped".
- `GapRow`: label, status chip (mastery status if present, else state), "wanted" star, concern caption, "From AI"/"Added by you".
- Row swipe actions: "Want" / "Unwant" (PATCH wanted), "Skip" / "Reopen" (PATCH state). Context menu: "Important", "Later (60 days)", "Dismiss", "Revisit" (POST triage; only actions that would change something are listed, based on the current `triageState`).
- After any change the model replaces that gap with the returned one; `changed: false` shows a short "No change." note.
- Toolbar "+" opens `AddGapSheet`: label field ("Add a gap you want covered..."), "Wanted" toggle default on, optional concern picker. Save posts; failure keeps the text.
- States: spinner; failure `ContentUnavailableView` "Try again"; empty "No gaps for this topic yet."; pull to refresh.

### Gaps coming back (`ResurfacingGapsModel`, `ResurfacingGapsScreen`)
- Two sections: `You said "later"` (userDeferredDue) and "Check-in was dismissed" (dismissedCheckinDue). Rows show the gap label and its triage date.
- Actions per row: "Important" and "Dismiss" (triage), "Later again" (defer). The row leaves the list after a change.
- Empty: "No deferred gaps waiting to come back."; spinner, error with "Try again", pull to refresh.
- Rows do not link to the topic (the response has no course id to build a `Topic` route); default recorded below.

## Shared files
Re-read before editing; targeted `Edit`.
- `TopicStudyModesSection.swift` and `HomeStudyModesSection.swift` (batch 1): one row each.

## Edge cases
- Double actions: row actions disabled while that gap's request is in flight.
- A triage on a gap deleted elsewhere: 404 shows "This gap was removed." and drops the row.
- Offline: actions fail with the offline message; nothing queued.
- Label only whitespace: Save disabled.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: add a gap on iOS and see it on web's topic row as wanted; mark it Later and see it in the Later section with a date 60 days out; skip and reopen; a gap deferred with a past date (set on web or the bot) appears under "Gaps coming back".

## Defaults
- Triage actions in a context menu, curation as swipe actions.
- The resurfacing list is view-and-triage only; marking reminders as sent stays with the bot.
- Resurfacing rows do not open the topic.
