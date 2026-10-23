# ex10: drop drafts on server change, menu bar toggle

Diff: git diff --cached -- Sources/Shared/UnsentDraftStore.swift Tests/PostAnkiMacSmokeTests/UnsentDraftServerChangeSmokeTests.swift

## Todo 1: clear drafts when the server address changes
- The draft store now listens for the settings-saved notification itself (no MacRootView or SettingsScreen edit). It remembers the server it last saw; when a save changes the server, every draft belonging to another server is removed and drafts of the new server are kept. Saves that change only the token leave drafts alone.
- Init takes an optional notification center and scope provider (defaults: default center, ServerScope.current) so tests run in isolation. The singleton observes from first use.
- 3 new smoke tests in UnsentDraftServerChangeSmokeTests.swift (old drafts dropped, same address keeps drafts, new-server drafts kept).

## Todo 2: Settings toggle for the menu bar item
- Already implemented in ex5: AppStorage key MacMenuBar.enabledKey is used by the MenuBarExtra isInserted in PostAnkiMacApp and by the Mac-only toggle in MacSettingsView (MacMenuBarReview.swift), so no change was needed and SettingsScreen.swift stays untouched (no iOS guard needed).

## Defaults
- Chose "keep new-server drafts, drop others" over clear-all.
- Observer uses queue nil (runs on the posting thread, which is the main actor in SettingsScreenModel) for deterministic delivery.

## Checks
- xcodegen on copy /private/tmp/ex10spec; derived data /private/tmp/dd-g2.
- PostAnkiMac build: succeeded. PostAnkiIOS simulator build: succeeded. Mac scheme tests: succeeded.
- tsc/vitest/lint not applicable (Swift repo).

END-OF-REPORT
