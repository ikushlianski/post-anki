No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with sample data, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: save an article link on iOS, see its recommendation, approve it and open the new course; the item shows on web's learning list with the same status; start a path from a template and see it on web's learning paths page; abandon it.

