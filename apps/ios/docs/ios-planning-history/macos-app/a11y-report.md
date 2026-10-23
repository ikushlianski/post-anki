# Mac accessibility and window-size pass

## Labels and tooltips
- Added `.help` (matching the existing `.accessibilityLabel`) to icon-only buttons/menus: Save a link, Plan a session, Start a path, More (Practice), Add gap, New subject, New category, Put in category, Add note, Add module, Module actions, undo-banner Dismiss, launch-banner Dismiss.
- Added missing label + help: lecture "More" menu, dictation mic button ("Dictate knowledge"); added help on "Study tools".
- Decorative images marked `accessibilityHidden`: launch-banner warning icon, global-search result icon, quiz multi-select checkbox (selection is now exposed through the `isSelected` trait on the option button).
- Admin scan warning icon got an accessibility label ("Changes your data").
- Toolbar `Label(...)` buttons already carry text, so were left unchanged.

## Minimum sizes
- Main window already 760x520. Settings window now min 480 wide, min 320 tall (was fixed width only).
- Added `macSheetMinSize` to sheets that lacked it: move-to-subject (Mac knowledge), pending-review edit (480x460) and reject-reason, Socratic summary, tag picker, add-gap (420x320). No-op on iOS.

## Checks
- `PostAnkiMac` scheme: build succeeded and 80 Swift Testing tests in 13 suites passed (derived data /private/tmp/dd-ax; checked-in project used, no new files so no xcodegen).
- `PostAnkiIOS` scheme: iOS Simulator build succeeded.
- No package.json or swiftlint in this repo, so tsc/vitest/lint do not apply.

END-OF-REPORT
