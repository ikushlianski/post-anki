# ex2 report: command palette and shortcut help window

## Behavior
- Cmd-K (Edit menu, "Command Palette...") opens a sheet over the main window with a search field. It matches typed text against sidebar entry titles (prefix, substring) and group names (Study, Library, ...), with a subsequence fuzzy fallback. Up/Down move the highlight, Return or click jumps via MacNavigator, Escape closes.
- Help menu now has "Keyboard Shortcuts", which opens a separate Window scene (id "shortcuts") listing: General, one group per Go-menu section (built from the registry), and Practice and review.

## Files (all staged)
- Sources/PostAnkiMac/Palette/MacCommandPaletteMatcher.swift, MacCommandPaletteView.swift, MacShortcutHelp.swift (new)
- Sources/PostAnkiMac/MacCommands.swift, MacRootView.swift (sheet hook only), PostAnkiMacApp.swift (Window scene), Navigation/MacFeatureRegistry.swift (Cmd-K added to reservedShortcuts)

## Shortcut changes for README
- New: Cmd-K opens the command palette (Up/Down, Return, Escape inside it).
- New: Help > Keyboard Shortcuts window.
- Cmd-K is reserved in the registry, so no sidebar entry can use it.
- Fixed commands listed in the help window: Cmd-N, Cmd-R, Cmd-F, Cmd-comma, Cmd-Shift-M (Knowledge move to subject), Return / Shift-Return (Quick practice), Return (Language practice continue), Cmd-Return (Decide, Writing check).

## Defaults
- Group names = MacFeatureSection titles. Help window entries for fixed commands are a static list in MacShortcutHelp (only Go entries come from the registry).
- Cmd-K is wired through a NotificationCenter post from the command to MacRootView.
- Help "Return" entries are descriptive; the Cmd-Option-S reserved key is not listed because it is not a bound command.
- No automated tests: the Mac test target compiles only Sources/Shared (same limit as the shortcuts report).

## Checks
- xcodegen ran only on a copy at /private/tmp/ex2spec (worked); derived data /private/tmp/dd-e2.
- PostAnkiMac build: succeeded. PostAnkiIOS simulator build: succeeded. PostAnkiMac test action: TEST SUCCEEDED (summary line showed 0 XCTest executions, likely Swift Testing, so the count is unconfirmed).
- Diff: git diff --cached -- Sources/PostAnkiMac
- tsc/vitest/lint not applicable (Swift repo; no lint command).

END-OF-REPORT
