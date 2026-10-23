# Report: Offline grade queue

## Built
- `Sources/PostAnkiIOS/PendingGradeQueue.swift` (new): actor persisting `pending-grades.json` in Application Support. `PendingGrade` stores variantId, knowledgeBitId, grade, durationMs, requestId, createdAt. API: `enqueue(_:knowledgeBitId:)`, `flush()`, `remove(requestId:)`, `pendingKnowledgeBitIds()`, `count()`, pure `shouldKeep(_:)`.
- `DueReviewModel.swift`: URLError on grade enqueues and advances ("Saved offline, will send later", reviewed count +1, `GradedCard.reviewId` nil). `pendingCount`, `isOffline`, `flushPending()`. `load()` filters cards whose knowledgeBitId is queued; a URLError on load with pending grades shows the offline empty state.
- Undo: reviewId nil, `remove(requestId:)` true restores locally with no network call; false gives "Already sent, can't undo". Non-nil reviewId uses the unchanged DELETE path. Undo is also allowed in the `.error` state.
- `DueReviewModel+Helpers.swift` (new): static helpers moved out to keep file size down.
- `DueReviewScreen.swift`: scenePhase `.active` flush, offline empty text, "N grades waiting to send" caption, Undo in error state.
- `DueTodayCard.swift`: `PendingGradeQueue.shared.flush()` before the count request.

## Double-recording prevention
- Queued entry keeps the card's requestId, so a replay returns the stored review (server idempotency).
- Enqueue dedupes by requestId; a card is enqueued only after its online attempt failed.
- `isFlushing` guard; flush re-reads the file before each send and skips removed entries; entries leave the file only after 2xx or a permanent error.
- `remove(requestId:)` refuses while that entry is `inFlightRequestId`.
- `load()` hides cards whose knowledge bit is still queued; the offline path also drops same-bit cards from the prefetched queue.
- 401, URLError, cancellation, 5xx, 408, 429 stop the flush and keep everything.

## Defaults
- Notice is set after `showNext()` so it survives the reload.
- `durationMs` nil is stored as 0.
- Plan defaults otherwise unchanged (URLError-only enqueue, 5xx online keeps Retry, no expiry).

## Build
Exit code 0.

## Deviations
- Helpers split into DueReviewModel+Helpers.swift (allowed).
- Added `isErrorState` computed property on the model.
- `loadIfNeeded()` flushes then calls `load()`.

END-OF-REPORT
