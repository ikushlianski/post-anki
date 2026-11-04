# Manual test: approval screen redesign

Run on the isolated e2e stack (:5550), never the dev app.

1. Open the review page: a loading screen shows, then one table per source with a row per suggestion.
2. Break the API: the error screen shows with Try again and Go to home.
3. Open a row: edit front, back, example inside the expanded row; edits survive Approve with feedback.
4. Approve and Reject (with and without feedback): screen reader says "Approved: <front>" / "Rejected"; focus moves to the next card.
5. Tick two cards, open Approve selected, untick one: the count drops and only the ticked card is approved.
6. Select all and press x: your own added cards are never selected.
7. The "..." menu per source: Add new KI, Approve all, Regenerate, Compare models; Regenerate and Add new KI are disabled with a reason while regenerating.
8. Add a card by hand: helper text explains front, back and pending status.
9. Narrow the window to phone width: the list stacks instead of a table.
