# Plan: Offline grade queue (todo item 5)

## Goal
Grades given while offline are saved on the device and sent later, in order, without ever recording a card twice.

## Facts read
- `PendingAnswerQueue` (`Sources/PostAnkiIOS/PendingAnswerQueue.swift`): actor, Application Support JSON, `isFlushing` guard, FIFO flush; URLError / CancellationError / 5xx / `unauthorized` stop and keep; any other error drops the item.
- `ExerciseScreen.swift:130-145` enqueues only on `URLError` (not `.cancelled`) and shows "Saved. It will be graded when you're back online."; other errors show a message.
- `DueReviewModel.swift` (item 1, in place): `submit(_:)` seam at line 130; one `cardRequestId` per shown card, reused on retry (`present` makes a new one); `GradedCard{card, grade, reviewId: String, requestId}`; `load()` filters `skippedVariantIds`.
- Server idempotency: `apps/api/src/knowledge-bit/knowledge-bit-review.orchestrator.ts:67-72` replays a stored review for a known `requestId` without changing the schedule; unique column `apps/api/src/db/schema.ts:1304`. Record route `router-table.ts:99`; controller `knowledge-bit-review.controller.ts:35-57` (201; 400 invalid_input, 403 not_approved, 404 variant_not_found).
- No `03-intervals-and-undo/plan.md` exists yet; the undo contract below is a proposal that item 4 must honour.

## Approach
New `actor PendingGradeQueue` mirroring `PendingAnswerQueue`. `DueReviewModel` enqueues from its existing grade path when the send fails with a network error. No new module or endpoint. Reuses `APIClient.recordReview` and `RecordReviewInput` from item 1.

## Steps
1. `Sources/PostAnkiIOS/PendingGradeQueue.swift` (new, ~110 lines).
   - `struct PendingGrade: Codable, Sendable, Equatable { variantId: String, grade: ReviewGrade, durationMs: Int, requestId: String, createdAt: Date }`.
   - `actor PendingGradeQueue`, `static let shared`, file `pending-grades.json` in Application Support, iso8601 dates, same load/save helpers as the answer queue.
   - `@discardableResult func enqueue(_ input: RecordReviewInput) -> Bool`: needs a non-nil `requestId`, else return false. If an entry with that `requestId` exists, return true without adding. Otherwise append and save; return the save result.
   - `func flush() async`: `isFlushing` guard. For each entry of a snapshot, first re-read the file and skip it if its `requestId` is gone (removed by undo). Set `inFlightRequestId`, send `APIClient.recordReview`, clear it in `defer`. Remove the entry only after the call returns (2xx). On error use `static func shouldKeep(_ error: Error) -> Bool` (nonisolated, pure): keep and `return` for `URLError`, `CancellationError`, `APIError.unauthorized`, `badStatus` 5xx, 408 and 429. Every other error drops the entry and continues (400/403/404 are permanent).
   - `func remove(requestId: String) -> Bool`: false if it equals `inFlightRequestId` or is not in the file; otherwise delete and return true.
   - `func pendingVariantIds() -> Set<String>` and `func count() -> Int`.
2. `Sources/PostAnkiIOS/DueReviewModel.swift`.
   - `GradedCard.reviewId` becomes `String?`; nil means "queued, not yet sent". The existing `lastGraded` assignment keeps passing `result.reviewId`.
   - New state: `private(set) var pendingCount = 0`, `private(set) var isOffline = false`.
   - In `grade(_:)` add catches after the `.cancelled` catch and before the generic one: `catch is URLError` calls `await PendingGradeQueue.shared.enqueue(input)`. On true: set `lastGraded = GradedCard(card, grade, reviewId: nil, requestId: cardRequestId)`, `reviewedCount += 1`, `notice = "Saved offline, will send later"`, refresh `pendingCount`, then `await showNext()`. On false: `gradeError = "Couldn't save that."`, `failedGrade = grade` (card stays, Retry).
   - `input.requestId` is already `cardRequestId`, so the queued entry carries the same id the failed online attempt used.
   - `load()`: set `isOffline = false` at the start; build the skip filter as `skippedVariantIds` plus `await PendingGradeQueue.shared.pendingVariantIds()`. In its error handling, `catch is URLError` (after the `.cancelled` case) with `pendingCount > 0` sets `current = nil`, `state = .empty`, `isOffline = true`; with no pending grades keep the existing error state.
   - `loadIfNeeded()`: `await flushPending()` first, then `load()`.
   - `func flushPending() async`: `await PendingGradeQueue.shared.flush()`, then refresh `pendingCount`; if `state == .error` or `isOffline`, call `load()`.
   - Item 4 contract, to be noted in its code: undo with `reviewId == nil` calls `remove(requestId:)`. True means restore the card, `reviewedCount -= 1`, refresh `pendingCount`. False means a flush already sent it: show "Already sent, can't undo" and clear `lastGraded`. No DELETE is sent in either case.
3. `Sources/PostAnkiIOS/DueReviewScreen.swift`: add `@Environment(\.scenePhase)` and `.onChange(of: scenePhase) { _, p in if p == .active { Task { await model.flushPending() } } }`. In the empty view, when `model.isOffline` show "You're offline. Your grades are saved and will send when you're back online." before the other empty texts. Under the card/empty content, when `pendingCount > 0`, a secondary caption "N grades waiting to send".
4. `Sources/PostAnkiIOS/DueTodayCard.swift` (item 6, only if it exists when this is implemented): in `DueTodayModel.load()` add `await PendingGradeQueue.shared.flush()` before the count request. If the file does not exist yet, skip; item 6 owns it.
5. Build with the command in `scratchpad/context.md`. Do not touch `HomeView.swift`, `PostAnkiIOSApp.swift`, `APIClient.swift`.

## Double-record prevention
- Each queued entry keeps the card's `requestId`; a replay after a lost response returns the stored review (orchestrator :67-72) and the entry is then removed.
- Enqueue dedupes by `requestId`.
- The model enqueues only after a failed online attempt, so for a given card there is never an online request and a queued entry active at once. A different card submitted online while a flush runs is independent.
- Concurrent flushes: the `isFlushing` guard makes the second caller return immediately (it does not wait). A `load()` that overlaps a flush could therefore see a card the flush has not yet confirmed, so `load()` filters out every variantId still in the queue file (entries leave the file only after 2xx).
- `remove(requestId:)` refuses while that entry is being sent, so an undo cannot report success for a grade the server is about to record.

## Defaults chosen
- Enqueue on `URLError` only: same rule as `ExerciseScreen`; offline, timeout and lost connection all map to it.
- 5xx keeps the card with "Couldn't save that." and Retry: a server fault is not "offline", the user can decide, and the flush still treats 5xx as keep-and-stop.
- 401 keeps the card with the Settings hint (plan 01): not an offline condition; a 401 during flush keeps all entries.
- Undo of a flushed queued grade says "Already sent, can't undo" rather than learning its `reviewId`: simplest safe choice, no result storage.
- Flush also keeps 408 and 429 (not in the answer queue): transient, and dropping them would lose a grade.
- Pending count caption included: cheap and shows queued work is not lost.
- No card caching: when the refetch fails offline after the last card, show the offline empty state; the Due screen needs a connection to start.
- Flush triggers: Due screen first load, scenePhase `.active` while the screen is open, and the Home due card load. Nothing is added to `HomeView.swift` or the app entry.
- Queue entries never expire and are not cleared on token change (single-user app).
- Corrupt file loads as empty, as in the answer queue.

## Edge cases
- App killed after enqueue: the entry is on disk and flushes at the next trigger.
- `durationMs` is fixed at grade time, so queue delay does not inflate it.
- Approval revoked or variant deleted before flush: 403/404 drops the entry silently.
- Two grades of the same variant on different shown cards both stay (distinct `requestId`s); the refetch filter prevents re-showing a variant that is still pending.
- Offline grade of the last card then back online with the screen open: foreground or Retry flushes, then reloads from the error/offline state.
- Save to disk fails: card stays with Retry, nothing is lost silently.

## Tests
No test target (`project.yml`, out of scope). `PendingGradeQueue.shouldKeep(_:)` is pure so a target can cover it later. Manual run against the dev API:
- Airplane mode, grade 3 cards: each advances with the notice, caption shows 3, one entry per card in `pending-grades.json`.
- Reconnect, foreground: caption clears, server shows 3 reviews in order.
- Kill the connection mid-flush then reconnect: still one review per card.
- Offline grade then undo: entry removed, no DELETE, nothing recorded.
- Wrong token while flushing: entries stay.

## Done when
- Build exits 0.
- A URLError on grade queues it with the card's `requestId`, advances, increments reviewed count, shows the notice.
- Flush is FIFO and removes entries only after 2xx; network, 5xx, 401, 408, 429 keep them; 400/403/404 drop them.
- No queued variant reappears in a refetch; no duplicate reviews server-side.
- `remove(requestId:)` exists with the in-flight refusal, and item 4 is told the `reviewId == nil` contract.
- `HomeView.swift`, `PostAnkiIOSApp.swift`, `APIClient.swift` untouched.

END-OF-REPORT
