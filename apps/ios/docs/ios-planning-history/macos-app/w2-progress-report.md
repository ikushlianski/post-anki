# Wave 2c: Mac Progress screen

Diff: `git diff --cached -- Sources/Shared/ProgressRows.swift Sources/Shared/ProgressModel.swift Sources/PostAnkiIOS/ProgressScreen.swift Sources/PostAnkiMac/MacProgressView.swift`

## Changes
- `git mv` Sources/PostAnkiIOS/ProgressRows.swift to Sources/Shared (unchanged content).
- `ProgressModel` split out of ProgressScreen.swift into Sources/Shared/ProgressModel.swift (unchanged); iOS ProgressScreen keeps only the view.
- New Sources/PostAnkiMac/MacProgressView.swift: cards for This week (adaptive tile grid: streak from the weekly digest, retention, to mastery, coverage), Coverage, Concerns, Retention (all time), Milestones; content capped at 900pt wide; toolbar Reload with Cmd-R; `.task` load.
- Untouched: MacRootView, MacSidebarItem, PostAnkiMacApp, project.yml. The view is unwired until wave 3.

## States
- All three calls fail before first load: full "Couldn't load" with Try again. One fails: section caption. No milestones: existing empty view.

## Defaults
- Streak tile sits inside the "This week" card, using the digest as the plan says.
- Card styling is a quaternary rounded background (no new shared component).
- Ran `xcodegen generate` once (files moved/added); the generated xcodeproj is not staged.

## Checks
- PostAnkiMac (macOS) build: BUILD SUCCEEDED (/tmp/dd-prog).
- PostAnkiIOS (iOS Simulator) build: BUILD SUCCEEDED (/tmp/dd-prog-ios).
- No tests or lint in scope; no GUI check done.

END-OF-REPORT
