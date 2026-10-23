# Report: 02 decide and badge

## Built
- Approve and reject per pending item (buttons and swipes). A row is removed only after the server answers 200. Emptied sections and the empty state follow.
- Error mapping: no_variant keeps the row with a message; blocked and not_found remove the row with a notice; offline, unauthorized and other errors keep the row with a message. In-flight ids disable the row's controls.
- Review tab badge from a shared count store: refreshes on launch, foreground and list load, drops by one per decision, hidden at 0.
- Item 01 finding fixed: the ProgressView now shows when `!hasLoaded && errorMessage == nil`.

## Files touched (staged)
- Sources/PostAnkiIOS/PendingReviewScreen.swift
- Sources/PostAnkiIOS/PendingReviewRows.swift (new, row subviews moved here)
- Sources/PostAnkiIOS/PendingReviewCountStore.swift (new)
- Sources/PostAnkiIOS/API/APIClient+PendingReview.swift
- Sources/PostAnkiIOS/API/PendingReviewModels.swift
- Sources/PostAnkiIOS/HomeView.swift (one `.badge` line on the Review tab)

## Defaults taken
- Followed plan defaults (confirmed removal, no full swipe, no reject confirmation, Approve disabled with no variants).
- Added `PendingReviewSource.withBits(_:)` helper in the models file.
- Row subview structs made non-private so they work across files.
- Count refresh retries once if a local adjustment happened mid-fetch.

## Build
Exit code 0, no errors or warnings from the build output.

## Not done
Nothing outstanding. Manual testing not run (no test target).

END-OF-REPORT
