# ex5 report: menu bar review item, per-entry back/forward, reload after long absence

## Behavior
- A menu bar item shows the pending review count (existing PendingReviewCountStore). Its menu has "Review (n due)" which activates the app, opens/raises the main window and selects Review via MacNavigator, plus Quit. Settings has a "Show review count in the menu bar" toggle (AppStorage mac.menuBarEnabled, default on).
- Go menu has Back (Cmd-[) and Forward (Cmd-]) acting on the current sidebar entry; both disabled when there is nothing to step to. Both are reserved in the registry and listed in the shortcut help window (Option-Cmd-S is listed there too).
- Returning to the app after more than 5 minutes away reloads the visible screen through the same settingsVersion identity used on settings save. No reload when there was no recorded resign time, or when unsent input exists.

## Files (staged)
- New: Sources/PostAnkiMac/MenuBar/MacMenuBarReview.swift, Navigation/MacStackHistory.swift, Navigation/MacActivationReload.swift, Tests/PostAnkiMacRegistryTests/MacNavigationHistoryTests.swift
- Edited: MacRootView, PostAnkiMacApp, MacCommands, MacCoursesView (path now from the per-entry history), Navigation/MacFeatureRegistry, Palette/MacShortcutHelp

## Defaults and limits
- Back/forward is wired only for Courses, the one entry whose stack uses a value path. All other entries push with state-driven navigationDestination(item:) / NavigationLink closures, which expose no path; Cmd-[ / Cmd-] are disabled there until those views move to a history-backed path (each needs its own view change).
- History lives in MacHistoryCenter keyed by entry id, so Courses keeps its stack when you switch entries and come back; forward is cleared when a new item is opened.
- Unsent input = MacUnsentInput: any source flagged through MacUnsentInput.shared.set(_:hasInput:) (siblings may call it; nothing calls it yet) or a focused text view with text in the key window. Unfocused unsent text is not detected, but sibling drafts persist and restore.
- MenuBarExtra hangs the hosted test run when inserted, so it is not inserted when XCTest env vars are present (isInserted is .constant, recomputed when the toggle changes).
- Settings window min height raised to 400 for the toggle row.

## Checks
- xcodegen only on the copy /private/tmp/ex5spec; derived data /private/tmp/dd-f1.
- PostAnkiMac build and test: TEST SUCCEEDED (smoke 106 tests plus registry bundle). PostAnkiIOS simulator build: BUILD SUCCEEDED.
- Diff: git diff --cached -- Sources/PostAnkiMac Tests/PostAnkiMacRegistryTests
- tsc/vitest/lint not applicable (Swift repo).

END-OF-REPORT
