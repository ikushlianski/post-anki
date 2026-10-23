No confirmed scenarios, built from the briefs. Written by hand for a light run.

Covers: knowledge-item chat follow-ups, the review list polish, scheduled-review undo, dictation status, and the review sheet's Done button. Nothing here was exercised against live data; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj and run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with at least one approved knowledge item, a few pending items from two sources, and some review cards due today. Set the server address and token in Settings.

## Chat
1. Open a knowledge item's chat, send a question, then a follow-up. Expect both replies; the API log shows the follow-up request with `transcript` entries shaped `{role: "user"|"assistant", text}` and a 200.

## Review list
2. Review tab: tap Approve all on a source. Expect the confirm dialog's count to stay fixed while items are approved, and a summary with the real result.
3. Reject an item, tap Undo, then pull to refresh and approve it. Expect it gone after the refresh, not reinserted.
4. From Add knowledge, send text, tap Review new items. Reject one item. Expect Done disabled until the undo bar goes away, then Done closes the sheet.

## Scheduled review
5. Due today: grade a card and tap Undo. Expect the card back and the grade removed on the server.
6. Go offline, grade a card, tap Undo. Expect the card back and nothing sent when back online.
7. Throttle the network (Network Link Conditioner, very bad network), grade, then tap Undo while it sends. Expect: if the send fails cleanly, the card is back; if it lands, the server undo runs once and the card is back; if it cannot be confirmed, an honest "couldn't confirm" message and no second grade on the server after re-grading.
8. Put the app in the background while a grade is sending and return. Expect no reload mid-grade and no stuck buttons.

## Dictation
9. Send text, then immediately send more. Expect Submit available again right after each save, and "Extracting items…" shown until the last extraction finishes.
10. Send text to a course deleted on the server. Expect "That course no longer exists. Go back and pick another."

## Data gap check
- Nothing here was run against a real server or a real iPhone.
- Steps 7 and 8 depend on network timing and are the riskiest to verify by hand.
