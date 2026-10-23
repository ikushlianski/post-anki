No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with sample data, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: plan a 5 minute session on iOS, see it on web's study sessions page; start it, answer two questions, end it, see completed with 2 answered on web and the consistency rate change; a session ended with no answers shows Abandoned.

