# Wave 1b: Review badge

Changed: Sources/PostAnkiMac/MacReviewView.swift (staged). Added `.task { await PendingReviewCountStore.shared.refresh() }` on the view so opening Review reloads the count.

Diff: `git diff --cached -- Sources/PostAnkiMac/MacReviewView.swift`

Checks
- PostAnkiMac macOS build (-derivedDataPath /tmp/dd-badge): BUILD SUCCEEDED (first attempt failed on a sibling's half-written files, retry passed).
- iOS build: not run, no Shared file touched.
- tsc/vitest/lint: not applicable, Swift-only repo (no package.json).
- Code reading: MacRootView passes `count` as `.badge(Int)`, and SwiftUI hides a 0 badge. Approve/reject/undo go through `counts.adjust`/`refresh` in PendingReviewListModel. Not exercised in a running app.
- Refresh is guarded by `isRefreshing` and the mutation counter, so overlapping calls are safe.

Defaults: followed plan as written; no MacRootView change needed; manual UI verification left to the wave gate.

END-OF-REPORT
