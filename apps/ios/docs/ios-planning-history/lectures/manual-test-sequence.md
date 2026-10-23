No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with sample data, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: on a topic of a course with sources, Compile and watch it switch to the lecture; on a course without sources, see the sources prompt, find, approve one, compile; request an analogy and see it appear; the same lecture and analogy show on web.

