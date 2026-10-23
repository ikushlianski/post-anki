# Report: bulk approve and undo reject

## Built
- "Approve all (N)" section footer (shown when N > 1) with confirmation dialog, spinner, chunks of 200 sequential, partial-result message, `no_variant` row messages, count adjust/refresh.
- Undo-reject bottom banner (8 s, cancellable `[weak self]` timer Task, restore with 404/offline/unauthorized handling, source recreated at top, `restoredDuringLoad` re-applied by `load()`).
- Review fix: trailing swipe Reject no longer uses `role: .destructive`; uses `.tint(.red)`.

## Files touched (all staged)
- Sources/PostAnkiIOS/PendingReviewScreen.swift
- Sources/PostAnkiIOS/PendingReviewRows.swift
- Sources/PostAnkiIOS/PendingReviewListModel.swift (new, model moved out of the screen)
- Sources/PostAnkiIOS/PendingReviewUndoBanner.swift (new)
- Sources/PostAnkiIOS/API/APIClient+PendingReview.swift
- Sources/PostAnkiIOS/API/PendingReviewModels.swift

## Defaults
- Followed the plan's defaults; bulk error mapping lives on `PendingReviewDecision.bulkErrorMessage(for:)`.
- Summary text counts unknown skip reasons as "N other".
- If the bit is replaced by a newer undo while a restore is in flight, a successful restore is still applied to the list.

## Build
Exit code 0, no errors or warnings printed.

## Not done
Manual testing (no test target, not run on a device).

END-OF-REPORT
