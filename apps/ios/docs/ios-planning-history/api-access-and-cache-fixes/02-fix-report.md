# Settings address fix report

Change: SettingsScreenModel.save() now drops one trailing "/" after trimming, and rejects any address with a non-empty path, query or fragment (nothing saved). Error text now asks for just the server address (for example https://example.com). "https://host/" is saved as "https://host".

Build: xcodebuild (iOS Simulator, CODE_SIGNING_ALLOWED=NO, -quiet) produced no errors or warnings.

git diff 466d5d8fc0622526435aca37080a4ca365a85e2 --numstat -- Sources
10	0	Sources/PostAnkiIOS/HomeScreen.swift
104	0	Sources/PostAnkiIOS/SettingsScreen.swift
END-OF-REPORT
