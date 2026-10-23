No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with some practice history, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
1. Ask: ask about something in your cards; expect an answer with the matched cards listed. Toggle general knowledge and expect a broader answer.
2. Open a topic: expect a study chat; send two messages and expect replies that remember the first.
3. Write a note on the topic: expect it in the topic's notes on iOS and web, and found by notes search.
4. Open questions: expect the list from web probe sessions (may be empty); mark one answered or dismissed and expect it gone on web.
5. Knowledge-item chat still works after the chat view was shared.
