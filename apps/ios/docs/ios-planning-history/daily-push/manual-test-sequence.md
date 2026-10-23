No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Set the server address and access token in Settings, with sample data on the server.

## Steps
1. Open Home: the card sits under Due today and shows a topic, course and reason chip.
2. Tap it, type an answer, Submit: pass/fail and feedback appear and the field locks.
3. Tap Open topic: the topic hub opens.
4. Check the Due queue rows match web/bot; the picked gap is not repeated.
5. Pull to refresh: the answered question resets.
6. Turn on airplane mode and reopen: an offline message with retry shows.
