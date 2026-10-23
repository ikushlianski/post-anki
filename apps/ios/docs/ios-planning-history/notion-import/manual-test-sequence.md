No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Set the server address and access token in Settings, with sample data on the server.

## Steps
1. Home > Import from Notion; Import is disabled while the field is empty.
2. Paste a Notion database link: Import enables.
3. Import a small database: Imported N new items and the Review note.
4. Run it again: Nothing new message.
5. Paste a bad id: Notion couldn't open that database.
6. After a while the new items show in the Review tab.
