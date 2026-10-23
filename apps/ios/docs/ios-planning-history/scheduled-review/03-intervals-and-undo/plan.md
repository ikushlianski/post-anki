# Plan: Interval labels on grade buttons + undo last grade (todo items 3 and 4)

## Goal
Each grade button shows when the card would come back ("10m", "4d"), and the learner can undo the most recent grade, which returns that card to the front, unrevealed.

## Facts verified (server, read only)
- Units are SECONDS, integers. `previewGradeIntervals` returns `Math.round((dueAt - now) / 1000)` (`apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:109-122`); `toCard` just attaches it (`knowledge-bit-review-queue-cards.repo.ts:58`).
- "5.5 minutes" in the test title (`knowledge-bit-grade-schedule.test.ts:94`) is only wording: the value is `hard: 330` seconds, an int, so the `z.number().int()` schema holds (`packages/shared/src/knowledge-bit-review.ts:35-40`). The same test file shows `easy: 4 * 86_400`, and a reviewed card gives `32.5 * 86_400` (still an int).
- Web formatter: `apps/web/src/knowledge-bit/anki-review-interval.ts:34-52` (`formatIntervalSeconds`: `<60` "<1m", `<3600` "Nm", `<86400` "Nh", `<30d` "Nd", else months with one decimal "1.5mo"; JS `Math.round`, month = 30 days). Spoken form `describeIntervalSeconds` at `:14-32` ("less than a minute", "10 minutes", "1 day", "1.5 months"). Buttons: `anki-review-grade-buttons.tsx:28` (aria-label "Good, next in 10 minutes") and `:33-39` (small interval caption above the label).
- Undo: `DELETE /knowledge-bits/reviews/{reviewId}` -> 200 `{knowledgeBitId}`, 409 `not_latest`, 404 `review_not_found` (`knowledge-bit-review.controller.ts:59-70`). Undo only works while no later live review exists for that bit (`knowledge-bit-review-undo.ts:49-56`); an already-undone review also returns `not_latest`.
- Replay trap: `readKnowledgeBitReviewByRequestIdInTx` has NO `undoneAt` filter (`knowledge-bit-review.repo.ts:105-125`), and the orchestrator returns the stored result whenever the requestId matches (`knowledge-bit-review.orchestrator.ts:67-72`). Re-POSTing the old requestId after an undo would return the undone result and record nothing. The undone card needs a NEW requestId.
- Web undo UX (`anki-review-session.ts:119-137`, `anki-review-session-actions.ts:160-190`): the undone card goes to the FRONT (any queued copy of the same bit removed), `revealed: false`, `shownAt` reset, tally decremented (floored at 0). The web keeps a multi-level stack; 409/404 pops that entry and shows "That grade can't be undone any more, because the card was reviewed again since." Undo shares the grading in-flight lock (`exclusive`). The bar stays visible when the queue is exhausted but an undo entry exists (`anki-review-screen.tsx:164`).

## Approach
Both items sit on plan 01's seams (`DueReviewGradeButtons`, `lastGraded`, shared `isGrading`). No new module or contract. Formatter is pure and static so a test target can cover it later. Read the current `DueReviewModel.swift` / `DueReviewScreen.swift` first (mid-implementation); reuse their real property names, in particular the per-card requestId property.

## Steps
1. `API/ScheduledReviewModels.swift`
   - Add `enum IntervalFormat { static func short(seconds: Int) -> String; static func spoken(seconds: Int) -> String }` mirroring the web functions exactly (Double math, `.rounded()`, month = 30 days, one-decimal months with a trailing ".0" dropped: "1mo" not "1.0mo", plural "1 minute"/"2 minutes").
   - Add `extension IntervalPreview { func seconds(for grade: ReviewGrade) -> Int }`.
   - Add `struct UndoReviewResult: Codable, Sendable { let knowledgeBitId: String }`.
2. `API/APIClient+ScheduledReview.swift`: `static func undoReview(reviewId: String) async throws -> UndoReviewResult` calling `request("/knowledge-bits/reviews/\(encodedId)", method: "DELETE")` (percent-encode the id with the same allowed set as `tz`).
3. `DueReviewScreen.swift` (or `DueReviewViews.swift`): `DueReviewGradeButtons` takes `preview: IntervalPreview`; each button is a two-line label (caption `IntervalFormat.short`, then the grade name), `.accessibilityLabel("Good, next in 10 minutes")` from `spoken`. Still `.disabled(isDisabled)`. Add an "Undo" button (toolbar, `arrow.uturn.backward`) shown only when `model.lastGraded != nil`, `.disabled(model.isGrading)`; also visible in the empty/"Done" state. It calls `Task { await model.undo() }`.
4. `DueReviewModel.swift`: add `func undo() async`:
   - `guard !isGrading, let last = lastGraded else { return }`; set `isGrading = true` before the first `await`; `defer` resets. Grading and undoing share this one flag, and the grade buttons and Undo are both disabled by it.
   - Also return early while `state == .loading` (a refetch is in flight).
   - Call `APIClient.undoReview(reviewId: last.reviewId)`.
   - Success: `lastGraded = nil`; `pendingAttempt = nil`; `reviewedCount = max(0, reviewedCount - 1)`; remove from `queue` any card with the same `knowledgeBitId`; push the currently shown card (if any) back to the head of `queue`; present `last.card` through the same path `showNext()` uses to show a card (sets `isRevealed = false`, clears `gradeError`, resets `shownAt`, assigns a NEW per-card requestId); `state = .card`; clear `notice`.
   - `APIError.badStatus(409, _)` or `(404, _)`: `lastGraded = nil`; `notice = "That grade can't be undone any more."`; no state change.
   - `APIError.unauthorized`: keep `lastGraded`; `gradeError = "Your session expired. Update your token in Settings, then retry."`.
   - Network/5xx/other: keep `lastGraded`; `gradeError = "Couldn't undo that. Try again."` (the user taps Undo again; DELETE is naturally idempotent-safe, a repeat gives 409 which clears it).
   - Ignore `CancellationError` / `URLError.cancelled`.
5. Keep each file under 300 lines; split views into `DueReviewViews.swift` if needed.
6. Build with the command in `scratchpad/context.md`.

## Constraint for item 5 (offline queue) - not designed here
- A grade that is still only queued locally has no `reviewId`; undoing it must REMOVE it from the local queue by `requestId` and never call DELETE. `lastGraded.reviewId` therefore becomes optional or an enum (queued vs saved).
- The decision must be made at tap time by asking the queue (actor-serialized): still pending -> remove locally; already flushed -> use the stored `reviewId` (the flush result must update `lastGraded` or be looked up by `requestId`) and DELETE.
- A queued grade removed by undo must never be sent later; the card then gets a new requestId as in step 4.

## Tests
No test target exists (out of scope to add). `IntervalFormat` is pure for later unit tests covering 0 -> "<1m", 59 -> "<1m", 60, 330 -> "6m", 600 -> "10m", 86_400 -> "1d", 345_600 -> "4d", 2_808_000 -> "1.1mo", 2_592_000 -> "1mo", and the spoken plurals. Manual run against the dev API:
- Buttons show server intervals; a new card shows about 1m / 6m / 10m / 4d.
- Grade Good, tap Undo: the same card returns unrevealed, the count drops by 1, the server shows the review undone; grading it again records a new review (not a replay).
- Grade a card, then grade the next card on the web or another device for the same bit, tap Undo: notice shown, Undo disappears.
- Airplane mode while tapping Undo: error shown, Undo still there; reconnect and retry works.
- Double tap on Undo sends one DELETE; Undo is disabled during a grade POST.

## Done when
- Build exits 0 (own derived data path).
- Each grade button shows a short interval and a spoken accessibility label from the server's seconds.
- Undo is visible only with `lastGraded`, disabled while grading or undoing, and returns the card to the front, unrevealed, with a new requestId and a decremented `reviewedCount`.
- 409/404 clears `lastGraded` with a notice; network error keeps it with an error.
- Only the four allowed files are touched; nothing is logged beyond what plan 01 logs.

## Defaults chosen
- Seconds, as the server sends them: verified in code, not guessed from the test title.
- Mirror the web formatter strings ("<1m", "6m", "1.5mo") for parity; trailing ".0" dropped on months.
- Single-level undo (only `lastGraded`): plan 01's seam; the server also refuses an undo when a later review exists, so deeper undo has little value on mobile. The web is multi-level.
- Undone card appears unrevealed with a reset timer: web parity.
- Undo also available in the "Done for today" state: web parity, otherwise the last card cannot be undone.
- The currently shown card goes back to the head of the queue rather than being dropped: nothing is lost and the order stays natural.
- Shared `isGrading` flag for grading and undoing: the simplest double-tap guard, web parity (`exclusive`).
- Network error on undo keeps `lastGraded` (the learner can retry); 409/404 clears it.

END-OF-REPORT
