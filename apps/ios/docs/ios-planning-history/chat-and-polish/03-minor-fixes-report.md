# Minor fixes

## 1. Undo of a grade being sent
- `PendingGradeQueue.remove(requestId:)` now returns `PendingRemoval`: `.removed`, `.cancelledInFlight`, `.notFound`. Only `.notFound` shows "Already sent, can't undo".
- Design: on `.cancelledInFlight` the model waits for the send result via the new `cancelledSendOutcome(requestId:)`. The queue's `flush` records the server `reviewId` if the send succeeded, and nothing if it failed and was dropped.
  - No review id (send failed, grade dropped): the card is restored like a normal undo.
  - Review id returned (send succeeded): the existing `APIClient.undoReview(reviewId:)` runs once, then the card is restored. If that undo call fails, `lastGraded` is kept with the review id and the notice "Grade was saved before undo; undo again" shows, so the next undo uses the normal server path.
- A grade is never sent twice and never silently lost.

## 2. Add knowledge detection flag
`isDetecting` is now computed from an `activeDetections` counter. It is incremented before detection and decremented by `defer`, so "Extracting items..." stays until the last detection finishes.

## 3. Done during reject undo
The Done button in `PendingReviewScreen` is disabled while `model.pendingUndo != nil`. It re-enables when the undo is used, dismissed or expires.

## Build
`xcodegen generate`, then `xcodebuild` (command as given): exit code 0, no errors or warnings in the filtered output.

## Defaults
- Disable Done rather than show a countdown.
- On "cancelled in flight", wait for the send result before restoring the card (this takes at most one network round trip).
- Kept the plain "Already sent, can't undo" text for `.notFound`.

END-OF-REPORT
