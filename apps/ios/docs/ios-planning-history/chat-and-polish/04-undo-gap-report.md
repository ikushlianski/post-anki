# Undo-while-sending gap fixes

## 1. Transient failure of a cancelled in-flight send (Medium)
Changed: `PendingGradeQueue.flush` now resends once with the same requestId when a send fails transiently and undo was requested. The server dedupes on requestId, so the resend returns the stored result if the first attempt landed.
- Resend succeeds: outcome `.sent(reviewId)`; the waiting undo calls the server undo once.
- Resend fails non-transiently: entry dropped, outcome `.notSent`, card restored.
- Resend fails transiently again: entry stays queued, requestId is marked unconfirmed, outcome `.unconfirmed`; the model shows "Couldn't confirm the grade; try undo again when online" and does not restore the card.
- Retrying undo on an unconfirmed entry (`remove`, now async) resends with the same requestId: success gives `.sent` then server undo; non-transient failure drops and restores; transient failure stays unconfirmed with the same notice.
- If a later normal flush sends an unconfirmed entry, its review id is kept so a later undo still reaches the server.
Why correct: a grade is either confirmed by the server (then undone once on the server), confirmed absent (dropped), or kept queued; it is never dropped while possibly stored, and the card is not restored in that case, so no double grade.
Types: `CancelledSendOutcome` (sent/notSent/unconfirmed) replaces the optional review id; `PendingRemoval` gained `.sent` and `.unconfirmed`.

## 2. Cancelled-send server undo error handling (Low)
Changed: extracted `performServerUndo` in `DueReviewModel.swift`, used by the normal undo path and the cancelled-send path. 409/404 give "can't be undone any more", 401 the session-expired message, other errors "Couldn't undo that. Try again." For queue-derived review ids the review id is kept in `lastGraded` on failure so undo can be retried. File is 295 lines.

## 3. Dictation `hasSent` reset (Low)
Changed: `IngestionDictationScreen.swift` resets `hasSent` only when `activeDetections == 0`.

## Build
`xcodegen generate` then the xcodebuild command: exit code 0, no errors or warnings printed.

## Defaults
- A background flush that hits a non-transient failure on an unconfirmed entry drops it; a later undo then says "Already sent, can't undo".
- Notice text uses the example wording from the task.
- No tests added (no test target).

END-OF-REPORT
