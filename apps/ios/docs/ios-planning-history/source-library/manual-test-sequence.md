No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Set the server address and access token in Settings, with sample data on the server.

## Steps
1. Home > Source library: sources grouped as Subject · Course.
2. Search for a word from a source title.
3. Swipe a link source, Re-fetch: message and badge update.
4. Swipe a source, Delete, read the confirm, confirm: it disappears; check the course on web.
5. Home > Content inbox: tap a row to expand it; pull to refresh.
