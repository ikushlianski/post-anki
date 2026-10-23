# Wave 1a: window restore

Diff: git diff --cached -- Sources/PostAnkiMac/MacRootView.swift Sources/PostAnkiMac/PostAnkiMacApp.swift Sources/PostAnkiMac/MacSidebarItem.swift Sources/PostAnkiMac/MacWindowFrameAutosave.swift

## Done
- MacSidebarItem moved to its own file as `enum MacSidebarItem: String, CaseIterable` with storageKey "mac.sidebarSelection" and fallback .courses.
- MacRootView uses @AppStorage plus a computed Binding<MacSidebarItem?>; unknown stored value falls back to courses; setting nil is ignored (never persisted).
- MacWindowFrameAutosave (NSViewRepresentable) sets frame autosave name "PostAnkiMainWindow" once in a window; attached as background in PostAnkiMacApp. defaultSize kept.

## Checks
- xcodegen generate run once (new files); xcodebuild PostAnkiMac macOS build into /tmp/dd-restore: BUILD SUCCEEDED.
- tsc/vitest/lint do not apply (Swift repo); no lint config run.
- Not verified (GUI, manual): resize/quit/relaunch, disconnected monitor, "Close windows when quitting".

## Defaults
- Used plan defaults only; the Hashable conformance now comes from String raw values.
- Settings stays a sidebar case until wave 4; the Review "Open Settings" closure writes the storage key.

END-OF-REPORT
