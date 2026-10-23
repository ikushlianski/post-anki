# Plan-2 report: quality basic Mac app

Plan: `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/macos-app/plan-2.md` (119 lines, covers all 9 open `macos-app` todos, no questions asked).

## Waves
- Wave 1 (parallel, file-disjoint, no conflict found): window restore (owns MacRootView, PostAnkiMacApp, new MacSidebarItem file, frame-autosave helper), badge (owns MacReviewView only), icon + accent (owns project.yml and a new Mac asset catalog), package tests (owns Package.swift, Tests folder, README).
- Wave 2 (parallel, file-disjoint): Home, Knowledge browser, Progress. Each moves its iOS models/rows into Sources/Shared and adds one new Mac view; none touches the root, the sidebar enum, the app file or project.yml.
- Wave 3 (single owner): adds the three new sidebar rows and detail cases.
- Wave 4 (single owner): Settings window on Cmd-comma (Settings leaves the sidebar), File > New Knowledge Item Cmd-N, Go menu Cmd-1..6, sidebar/toolbar commands.
- Wave 5 (single owner): one Mac state view for empty, offline and signed-out, applied to every Mac screen; also writes the manual test sequence.

## Facts that shaped the plan
- The Review badge already exists since step 2; that todo shrinks to refreshing the count when Review opens, plus checking it.
- SwiftUI window restoration does not happen when "Close windows when quitting an app" is on, so the plan saves the selected entry in app preferences and the window frame through AppKit's own frame saving.
- Neither target has an asset catalog yet. The package has no tests. `ProgressLoadError` in the package already sorts errors into offline, signed out, not found and other, and the plan reuses it everywhere.

## Defaults logged (plan "Decisions taken")
- Mac "Study now" opens Due today, because the Mac has no practice screen. "Latest topic" means the last opened course, the same as iOS.
- Knowledge "edit" matches iOS: change status, delete, move to another subject, generate variants. Wording is edited during review, and a free-text editor is cut.
- Signed-out comes from the server's 401, not from a missing local token. A full-screen error shows only when nothing has loaded yet.
- Package tests use Swift Testing, with fixtures copied from the server's response schemas in ../post-anki.

## Verification
After each wave: `xcodegen generate`, then `xcodebuild` for PostAnkiIOS (iOS Simulator) and PostAnkiMac (macOS), then `swift test --package-path Packages/PostAnkiAPI`. Agents running in parallel use separate build folders. Checks that need a person at the Mac go in manual-test-sequence.md.

END-OF-REPORT
