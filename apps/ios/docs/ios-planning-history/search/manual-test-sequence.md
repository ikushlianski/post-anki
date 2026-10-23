No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Set the server address and access token in Settings, with sample data on the server.

## Steps
1. Home > Search, type a course name, tap it: the course opens.
2. Search a subject name, tap it: its courses list, tap one.
3. Switch to Topics and modules, search a tag name: ranked rows with tags; tap a topic.
4. Clear the field: Type to search returns. Search nonsense: No matches.
5. Airplane mode: offline message.
