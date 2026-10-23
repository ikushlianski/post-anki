# Shortcuts audit report

## Audit
- Sidebar: every entry is in the Go menu, which is built from the registry. Cmd-1 to Cmd-6, Cmd-Shift-L and Cmd-Shift-F are unique. The registry validator rejects duplicates and reserved keys.
- Cmd-R: every Mac screen with a Reload button (Home, Progress, Courses, Knowledge, Quick practice, Study sessions, Gaps, Daily push, Learning list, Learning paths, Decide, Open questions, and every MacReloadButton screen) already has it. No gap.
- Cmd-F: Knowledge, Sources, Tags, Phrase bank and Notes use .searchable, so macOS 14 focuses the toolbar field on Cmd-F by default. Gap: the Search screen has an inline field and iOS-only .searchable, so Cmd-F did nothing.

## Changes
- Sources/Shared/GlobalSearchScreen.swift: inside the macOS-only block, a toolbar Find button with Cmd-F sets searchFocused. iOS unchanged.
- Sources/PostAnkiMac/Navigation/MacFeatureRegistry.swift: Cmd-F added to reserved shortcuts, so no sidebar entry can take it.
- README.md and .planning/macos-app/manual-test-sequence.md: shortcut sections updated.

## Defaults
- Used a Find button with Cmd-F, since searchFocused on .searchable needs macOS 15 and the target is 14.
- Review (Due today, Pending) has no Reload button, only pull-to-refresh, so it got no Cmd-R, per the audit scope.
- No automated test: the Mac test target compiles only Sources/Shared, so the registry and menu are not testable without a project.yml change.

## Checks
- xcodegen to /private/tmp/xc-sc failed (XcodeGen copy error), so I built the existing checked-in project with -derivedDataPath /private/tmp/dd-sc. Nothing was generated in the repo root.
- PostAnkiMac build: succeeded. PostAnkiIOS simulator build: succeeded. PostAnkiMac tests: 66 passed.
- Diff: git diff --cached
- tsc and vitest do not apply: this is a Swift repo.

END-OF-REPORT
