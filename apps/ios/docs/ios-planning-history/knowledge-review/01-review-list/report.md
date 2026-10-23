# Report: 01 review list

## Built
A "Review" tab (after Inbox) lists pending knowledge items grouped by source, with each item's questions (kind, prompt, answer). It has loading, empty, first-load error with retry, offline and token-rejected messages, pull-to-refresh and refresh on tab re-entry. A failed refresh keeps the existing list and shows a red caption row.

## Files touched
- Sources/PostAnkiIOS/API/PendingReviewModels.swift (new)
- Sources/PostAnkiIOS/API/APIClient+PendingReview.swift (new)
- Sources/PostAnkiIOS/PendingReviewScreen.swift (rewritten, `init()` kept)
- Sources/PostAnkiIOS/HomeView.swift (one tab added)

## Defaults taken
- Followed the plan literally. The model class lives in the screen file, and `kind` and `origin` stay `String`.
- `.task` and `.onAppear` both call `load()`. The `isLoading` guard inside `load()` prevents duplicate calls.
- The header shows an "N items" count, with singular "1 item".
- `git add` on HomeView.swift also stages other teams' earlier changes to that file that were already in the index.

## Build
Exit code 0, no output.

## Not done
Nothing outside the plan. No tests, since the repo has no test target.

END-OF-REPORT
