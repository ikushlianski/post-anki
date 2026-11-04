# Manual testing

Setup: API on dev DB (migration 0130 applied), iOS simulator `PostAnkiIOSDev`.

1. Triage: swipe up on a card -> overlay shows chat icon + "Chat"; card leaves; Chat badge +1. Undo -> back, badge -1.
2. Swipe down -> Inbox (icon + label). Left/right show Reject/Approve with icons.
3. AI example: only via the action-bar button.
4. Chat queue (Pending Review, above Inbox): open card, tap a starter chip, get a reply, turns left drops; after 8 turns input is blocked with plain wording.
5. In chat: Accept -> card approved, leaves queue. Reject -> pick one of 7 reasons -> rejected. Back to triage -> returns to pending.
6. Last card -> decision list straight away (no "All done"/Done/feedback). Order: Rejected, Chat, Inbox, collapsed Accepted. Leave the list -> session finishes.
7. Reject reason chips show 7 reasons (incl. question bent to fit answer, restates source, text recall only); an old rejected row still shows its legacy label.
8. Add a filler note (e.g. greetings only) -> "Nothing here looked worth turning into a card." with Retry anyway / Dismiss; sidebar badge not raised. Add a short valuable note -> still yields a card.
