# ex3 report: Test connection + failure log + Copy diagnostics

Diff: `git diff --cached -- Sources/Shared Packages/PostAnkiAPI Tests/PostAnkiMacSmokeTests/ConnectionCheckSmokeTests.swift`

## Changes
- Package: `RequestFailure.swift` (public `RequestFailure`, internal `FailureLog` ring buffer of 50, os.Logger subsystem com.ikushlianski.postanki). `APIClient.request` records network, 401, non-2xx and decode failures (not cancellations). Public `APIClient.recentFailures` and `clearRecentFailures()`.
- Logged: method, path with query names only (values dropped), status, error kind. Never headers, body or token.
- Shared: `ConnectionCheck.swift` (`ConnectionResult` classification over GET /streak, `Diagnostics` report + pasteboard via NSPasteboard/UIPasteboard). `SettingsScreen.swift`: Connection section with Test connection and Copy diagnostics.
- Tests: package `RequestFailureTests` (query values and token absent, buffer bounded at 50, network kind); smoke `ConnectionCheckSmokeTests`.

## Checks
- swift test (package): 64 tests passed (3 runs).
- PostAnkiMac scheme test (private spec in /private/tmp/ex3-spec, derived data /private/tmp/dd-e3): 106 + 6 tests passed.
- PostAnkiIOS simulator build: succeeded.

## Defaults
- MacLaunchIssue lives in the Mac-only target, so Shared got its own `ConnectionResult` mirroring its classification, with extra exact-status and decode cases.
- Signed in = request succeeded and a token exists; success with no token reports "reachable, no token saved".
- Repo has no CLAUDE.md; lint not run (none found in repo).
END-OF-REPORT
