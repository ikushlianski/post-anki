No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with sample data, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: submit a decision on iOS, flag one blind spot and dismiss another, open web's decide page and see the same session with "Flagged"/"Dismissed".

