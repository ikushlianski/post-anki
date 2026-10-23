# Fix batch 8 report

## Done
1. Continue studying: Home now sets a pending course (MacCourseOpenRequest) and switches to Courses; the Courses stack has a path binding and pushes that course on appear or when the request changes.
2. Knowledge bulk delete and move: selection is pruned to the visible items whenever the status filter, search or loaded items change, so hidden items can't be deleted or moved.
3. Quick practice: Return advances to the next question when feedback is showing; empty state now reads "No questions to practice".
4. Inbox reject: runConcurrently now caps parallel requests at 4 (default `limit`); it also applies to Sources delete/refetch. Bulk approve was already sequential in KnowledgeItemInboxModel, so unchanged.
5. Shared due-review card body: new Sources/Shared/DueReviewCardBody.swift used by both DueReviewScreen (iPhone) and MacDueReviewView. Platform differences are slots (answer field, key hint, show-answer button). Only visible iPhone change: Retry also appears with the grade error only when the card is revealed (same as before in practice).

## Files
New: Sources/Shared/DueReviewCardBody.swift, Sources/PostAnkiMac/Navigation/MacCourseOpenRequest.swift
Changed: MacHomeView, MacCoursesView, MacKnowledgeView, Practice/MacQuickPracticeView, Library/MacLibrarySupport, MacDueReviewView, PostAnkiIOS/DueReviewScreen.
The two new files need `xcodegen generate` in the real checkout (checked-in project not touched).

## Checks
- Private spec copy /private/tmp/sd8, derived data /private/tmp/dd-sD.
- Mac scheme build: succeeded. iOS scheme build: succeeded (before siblings' latest edits).
- Mac tests: FAIL, not from this batch. Fake-server tests all fail with "HTTP load failed -1003" because the sibling's new private URLSession in APIClient.swift bypasses FakeServer's URLProtocol.registerClass. Retried once after re-syncing, same result.
- No swiftlint config or package.json in repo, so no lint run.
- No new tests: the Mac sources are not in the test target, and the logic changes are in views.

## Defaults
- Added `limit: Int = 4` to runConcurrently.
- Used a shared observable request object rather than editing MacNavigator/MacRootView (sibling-owned).

END-OF-REPORT
