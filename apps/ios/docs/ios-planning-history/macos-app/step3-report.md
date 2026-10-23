# Step 3 report: macOS settings

Diff command: `git diff --cached -M --stat` (all staged, nothing committed).

## Result
- `SettingsScreen.swift` moved to `Sources/Shared` (git mv). iOS-only `.keyboardType(.URL)`, `.textInputAutocapitalization(.never)` and `SettingsToolsSection()` are behind `#if os(iOS)`; macOS adds `.formStyle(.grouped)`. iOS behaviour unchanged.
- Mac sidebar has a Settings entry (gear icon) showing the shared form.
- Due review "unauthorized" state on Mac now has "Open Settings" (switches the sidebar via an `onOpenSettings` closure passed root -> review -> due review) next to "Try again".
- `TokenStore`: Step 1 `#if os(iOS)` guard on `kSecAttrAccessible` confirmed, no access group (no change needed).
- README notes the keychain service name and the ad-hoc signing prompt caveat.
- `.planning/macos-app/manual-test-sequence.md` covers all three steps.

## Checks
- `xcodegen generate`: ok.
- iOS simulator build (CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED.
- macOS build (`platform=macOS`, CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED; only the generic AppIntents metadata warning.
- Not run: manual keychain/relaunch checks (need a GUI session); tsc/eslint/vitest do not apply to this Swift repo.

## Defaults (one line each)
- The unauthorized view is inline in `MacDueReviewView` with two buttons, since the shared message view supports one action.
- `MacReviewView` and `MacDueReviewView` take a required `onOpenSettings` closure.
- Settings is shown without a NavigationStack wrapper; the title comes from the shared view's `.navigationTitle`.

END-OF-REPORT
