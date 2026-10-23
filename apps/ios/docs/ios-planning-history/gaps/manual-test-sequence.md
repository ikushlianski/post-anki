No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with sample data, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: add a gap on iOS and see it on web's topic row as wanted; mark it Later and see it in the Later section with a date 60 days out; skip and reopen; a gap deferred with a past date (set on web or the bot) appears under "Gaps coming back".

