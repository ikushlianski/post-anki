# Fix 6 report: offline queues (F2, F6, F9, F10)

Diff: `git diff --cached -- Sources/Shared/{ServerScope,PendingQueueFlusher,DueReviewModel,PendingAnswerQueue,PendingGradeQueue,VariantCache,LastStudied}.swift Sources/PostAnkiMac/Launch/MacQueueFlushTrigger.swift Sources/PostAnkiMac/PostAnkiMacApp.swift Tests/PostAnkiMacSmokeTests`

## What changed
1. Flush on focus or network (F2): new `MacQueueFlushTrigger` (Mac, started from `PostAnkiMacApp.init`) flushes both queues at launch, on `NSApplication.didBecomeActive`, and when `NWPathMonitor` goes offline to online. It replaces the scenePhase hook in the app file. Shared `PendingQueueFlusher.flushAll` posts `pendingQueuesFlushed`; `DueReviewModel` listens, refreshes `pendingCount` and reloads if it was in an offline/error state. A successful `load()` now also refreshes `pendingCount`.
2. Tests (F6): `ScheduledReviewQueueSmokeTests` (offline grade sent exactly once, undo before send, undo after send, 4xx dropped / 5xx kept), `ScheduledReviewInFlightSmokeTests` (undo while in flight, undo after an unconfirmed send, using a small holding URLProtocol), `ServerBoundQueueSmokeTests` (server scoping, attempt cap, focus flush refreshing the waiting count). New fixtures: record-review, undo-review, graded-answer.
3. Bounded retries (F9): a queued answer is dropped after 5 failed grading attempts (`PendingAnswerQueue.maxFailedAttempts`). Only HTTP 5xx counts; offline, 401, 408, 429 do not use attempts. A 5xx no longer stops the flush, so later answers still go out.
4. Server binding (F10): queued grades and answers, cached variants (per-server cache folder) and the last course store the normalised server address (`ServerScope`). Records for another server are skipped (kept on disk, not counted, not sent) and come back when that server is selected again. Records written before this change have no address and are treated as belonging to the current server.

## Defaults taken
- `DueReviewModel` got an `init(gradeQueue:)` (default `.shared`) so tests use a temp queue.
- `VariantCache` and `LastStudied` take an optional directory / defaults argument for tests.
- Existing tests `CrashGuardSmokeTests.answerQueueRetention` now starts the fake server before enqueueing, because records are stamped with the server at enqueue time.
- Did not touch `PendingReviewCountStore` (it counts server-side review items, not queued grades).
- The Mac hook itself (focus and network triggers) has no automated test; the shared flush it calls is tested. Manual check: queue an offline grade, background the app, regain network.

## Checks
- Mac scheme tests: 102 tests, 17 suites passed. iOS scheme build: succeeded. Built from a private spec copy at /private/tmp/sB-proj (xcodegen ran there, never in the repo root), derived data /private/tmp/dd-sB.
- tsc, vitest and the JS lint do not apply (Swift repo); no swiftlint installed.
- Sibling conflict: the package sibling's `APIClient.session` (custom `URLSession`) bypasses the globally registered `FakeServer`, so every fake-server test fails against the live working tree. In the private copy only, I swapped `session.data` back to `URLSession.shared.data` to verify. The package sibling should make the fake server reach that session (for example by injecting `protocolClasses` or a test session).

END-OF-REPORT
