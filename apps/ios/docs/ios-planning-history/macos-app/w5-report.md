# Wave 5: empty, offline and signed-out states on every Mac screen

## Done
- New shared state view (`Sources/Shared/MacLoadStateView.swift`, macOS-only): offline, signed out (SettingsLink + Try again), other, notFound, plus `MacEmptyStateView`. Mac copy never says "pull to refresh".
- Applied to Home (full screen only when due and summary both failed with no data; otherwise existing inline text), Courses list and detail (+ empty states), Due review (replaces the inline unauthorized view; the `onOpenSettings` plumbing is removed), Pending items, Knowledge (also "No matching items"), Suspended, Progress (stale failure now a caption), Ingest submit failure (inline Mac text, input kept).
- Models gained additive failure kinds: `failure`/`hasLoaded` on the courses models, `failureKind` on knowledge, suspended and pending models. iOS keeps reading `errorMessage`/`failure` strings.
- `manual-test-sequence.md` rewritten for the whole Mac app.

## Defaults
- State view lives in `Sources/Shared` (guarded `#if os(macOS)`), not `Sources/PostAnkiMac`, because the shared Pending and Suspended screens must use it.
- Pending offline message is Mac-specific ("Try again when you're back"); iOS text unchanged.
- Ingest failure stays an inline message, not a full-screen state, so typed text is not lost.
- Cancellation shows nothing (classifier returns nil; spinner stays until the next load).
- Due review's "Open Settings" now uses SettingsLink inside the state view.

## Checks
- xcodegen generate once; PostAnkiMac (platform=macOS) BUILD SUCCEEDED; PostAnkiIOS (iOS Simulator) BUILD SUCCEEDED; swift test: 34 tests passed. No new compiler warnings.
- Not run: GUI checks (see manual-test-sequence.md). Lint/vitest: none in this repo.

Diff: `git diff --cached --stat`

END-OF-REPORT
