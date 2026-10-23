# Report: interval labels and undo (items 3 and 4)

## Built
- Grade buttons show a short interval caption (server seconds, web-parity format: "<1m", "6m", "4d", "1.5mo") and a spoken accessibility label ("Good, next in 10 minutes").
- Undo toolbar button (arrow.uturn.backward), shown when `lastGraded` exists in the card or empty state; disabled while grading/undoing or loading. The card returns unrevealed with a new requestId, count decremented, same-bit queued cards removed, the currently shown card pushed back to the queue head.
- 409/404 clears `lastGraded` with a notice; unauthorized and network errors keep it with an error message. Cancellation is ignored.
- Notice and error text are also shown in the empty state and for an unrevealed card so undo feedback is visible.
- Low fix 1: "Try again" button in the unauthorized view calls `model.load()`.
- Low fix 2: cancelled `load()` resets `hasLoaded = false`.
- `UndoReviewResult`, `IntervalPreview.seconds(for:)`, `IntervalFormat`, `APIClient.undoReview(reviewId:)` added.

## Defaults
- `pendingAttempt` line ignored; `failedGrade` is cleared instead.
- `GradedCard.reviewId` stays a non-optional String.
- Undo also clears `noCardsYet` so the empty message stays correct.
- Undoing a shown card of the same knowledge bit drops it rather than duplicating.

## Build
Exit code 0.

## Deviations
None. Only the four owned files were touched (staged).

END-OF-REPORT
