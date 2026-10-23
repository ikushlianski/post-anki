# Knowledge review run report

## Item status
1. Add a Review tab listing pending items grouped by source, with their questions: done. `Sources/PostAnkiIOS/PendingReviewScreen.swift:3` (plan/report/review in `01-review-list/`).
2. Approve or reject with buttons or swipes, removing the item from the list: done. `Sources/PostAnkiIOS/PendingReviewListModel.swift:30` (`02-decide-and-badge/`).
3. Pending count badge on the Review tab: done. `Sources/PostAnkiIOS/HomeView.swift:22`, `Sources/PostAnkiIOS/PendingReviewCountStore.swift:6` (`02-decide-and-badge/`).
4. Approve every item from one source in one tap: done. `Sources/PostAnkiIOS/PendingReviewListModel.swift:72` (`03-bulk-approve-and-restore/`).
5. Restore an item right after rejecting it: done. `Sources/PostAnkiIOS/PendingReviewListModel.swift:125` (`03-bulk-approve-and-restore/`).

Nothing stalled. All three reviews returned APPROVED with no Critical, High or Medium findings, so no fix dispatches were needed. Two Low findings (the spinner flashing before the first load, and the destructive-role swipe) were fixed inside the next item's implementation. Three Lows are logged under "To review / clarify" in `todo.md`: the "Approve all (0)" label while running, a rare restore-then-approve reappearance during a refresh, and the list model file at 325 lines.

## Defaults taken
- Copy the web's pending-review list. The Inbox tab is unchanged. This was set before the run.
- A row is removed only after the server confirms, not optimistically, and buttons are disabled per item while its request runs.
- `no_variant` keeps the row with a message. `blocked`/`not_found` remove it with a "decided elsewhere" notice. Offline keeps the row and queues nothing.
- The badge comes from the count endpoint, not the list length, because the list is capped at 200 items. It refreshes on launch, on return to the foreground and on every list load, and drops locally per decision.
- "Approve all (N)" appears only when 2 or more items are ready, as on the web, and goes through a confirmation dialog. Ids are sent in chunks of 200.
- The undo banner stays up for 8 s (the web uses 5 s) and holds one undo at a time. If the source section is gone when undoing, it is recreated at the top.

## Files touched (all staged, nothing committed)
- New: `Sources/PostAnkiIOS/PendingReviewScreen.swift` (the stub came first, as the contract required), `PendingReviewListModel.swift`, `PendingReviewRows.swift`, `PendingReviewCountStore.swift`, `PendingReviewUndoBanner.swift`, `API/APIClient+PendingReview.swift`, `API/PendingReviewModels.swift`
- Edited: `Sources/PostAnkiIOS/HomeView.swift`, which got the Review tab plus its `.badge` line and nothing else.

Note: `git add HomeView.swift` also staged earlier changes to that file by other teams that were already in the index.

## Final build
`xcodebuild ... -derivedDataPath /private/tmp/claude-501/dd-knowledge-review` exited 0, with no errors and no warnings from these files.

## Not verified
- No live API calls were made. The JSON shapes and error codes were checked against the server source only.
- Not run on a simulator or device. The swipe animation, the banner timing, badge rendering and VoiceOver are all unchecked.
- There is no test target, so no automated tests exist.

## Manual test sequence
1. Set a valid token in Settings and create two or more pending items from one source (via web ingest). The Review tab badge shows the count.
2. Open Review. Items appear grouped by source, with each question's prompt and answer.
3. Swipe right to Approve one item. The row disappears and the badge drops by 1.
4. Tap Reject on another item. The row disappears and the "Item rejected / Undo" banner appears. Tap Undo: the item returns to its old position and the badge goes back up.
5. Reject again and wait 8 s. The banner goes away.
6. Tap "Approve all (N)" on a source and confirm. The section disappears, a summary shows, and the badge drops by N.
7. Turn on airplane mode, then try Approve. The row stays with an offline message. Pull to refresh: the offline caption shows and the list is kept.
8. Approve an item on the web, then act on it in the app. The row is removed with the "decided elsewhere" notice.
9. Approve the last item. The "Nothing to review" state shows and the badge hides.

END-OF-REPORT
