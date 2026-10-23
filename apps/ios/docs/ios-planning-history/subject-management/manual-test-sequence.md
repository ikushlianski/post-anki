No confirmed scenarios, built from the plan. Nothing here was run against a server.

## Environment
- `xcodegen generate`, run PostAnkiIOS on an iPhone simulator (iOS 17+) against a local post-anki API with a token saved in Settings.

## Steps
1. Courses tab: expect an "Organise" section with "Manage subjects" below the subjects.
2. Open it, tap +, add subject "Test A" at top level, then "Test B" inside "Test A". Expect both listed; B under "Inside Test A".
3. Long-press "Test A", Rename to "Test A2". Expect the new name.
4. Tap Edit, drag a subject to a new position, tap Done, pull to refresh. Expect the order to stick.
5. Long-press "Test B", Merge into..., pick another subject. Expect a confirmation naming both; confirm. Expect "Moved N courses." Picking a subject of a different kind is not offered.
6. Long-press a subject, Delete. Expect a confirmation with the course count; Cancel leaves it, Delete removes it and its courses.
7. Go back to Courses. Expect the list to reflect all changes.
8. Open a subject: tap +, add category "Docs", then "Guides" inside "Docs". Expect nested headers.
9. On a course row tap the folder icon, pick "Guides". Expect it under Guides. Pick "No category". Expect it under "Not in a category".
10. Long-press a category, "Move into..." its own child. Expect "A category can't go inside itself."
11. Airplane mode, retry any action. Expect the offline message.
