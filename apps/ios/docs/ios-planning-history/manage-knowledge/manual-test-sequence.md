No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with some practice history, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
1. Knowledge list: expect approved items; search by text and filter by course (child courses included) and by status.
2. Open an item, tap Suspend: expect it in the Suspended list; Unsuspend there brings it back to Due today later.
3. Select several items, Move to another course: expect them under that course on web. Select some, Delete, confirm: expect them gone, with a count of any skipped.
4. Review tab: edit a pending item's wording and one question; expect the change on web. Due today card: edit the question; expect the edited text next time.
5. Reject a pending item: expect a reason sheet; pick a reason and expect it in the web feedback view. Skip sends nothing.
6. Edit a question that was rejected on web meanwhile: expect a "changed elsewhere" message.
