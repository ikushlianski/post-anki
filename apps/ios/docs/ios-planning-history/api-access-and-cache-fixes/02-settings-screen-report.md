# 02 Settings screen report

Files changed (staged):
- Sources/PostAnkiIOS/SettingsScreen.swift (new)
- Sources/PostAnkiIOS/HomeScreen.swift (toolbar gear NavigationLink to SettingsScreen)

`git diff 466d5d8fc0622526435aca37080a4ca365a85e2a --numstat -- Sources`:
10	0	Sources/PostAnkiIOS/HomeScreen.swift
97	0	Sources/PostAnkiIOS/SettingsScreen.swift

Build: xcodegen generate ok; xcodebuild (generic iOS Simulator, CODE_SIGNING_ALLOWED=NO) succeeded with no errors or warnings in quiet output.
Not verified: Keychain read/write and live server behaviour at runtime.

Defaults taken:
- Address is trimmed and saved only after validation and after any token save succeeds, so a token failure saves nothing.
- Empty token field on Save leaves the stored token unchanged.
- "Remove token" is disabled when no token is saved.
- Shows a short "Saved." / "Token removed." status line.
- Gear entry is a toolbar NavigationLink inside Home's existing NavigationStack.

END-OF-REPORT
