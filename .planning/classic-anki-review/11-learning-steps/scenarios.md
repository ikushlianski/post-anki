---
type: scenarios
branch: learn-from-doc-site
task: F-learn — minute-level learning steps (item 11)
state: confirmed
updated: 2026-10-10
---
# Scenarios: F-learn — minute-level learning steps

## Business Scenarios

SCENARIO 1: A new card goes through 1-minute and 10-minute steps before it graduates — asked

A never-seen card graded Again comes back in 1 minute, Good moves it to the 10-minute step, and Good on that last step graduates it to a 1-day review.

What to verify:
- New card: Again → back in 1 minute; Good → back in 10 minutes. Both mark it as learning.
- On the 10-minute step: Again → back to the 1-minute step; Good → graduates, back in 1 day, marked as in review.
- Ease does not change while a card is learning.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 2: Hard and Easy while a card is learning — asked

Hard repeats the current step instead of moving forward, and Easy skips the remaining steps.

What to verify:
- Hard on a new card or the 1-minute step → back in 5.5 minutes (halfway between the two steps), still on the first step.
- Hard on the 10-minute step → back in 10 minutes, same step.
- Easy at any learning point → graduates straight to 4 days, marked as in review.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 3: A forgotten review card relearns in 10 minutes and records a lapse — asked

Again on a card that is in review sends it to a 10-minute relearning step, counts one lapse and lowers ease. Passing that step returns it to review.

What to verify:
- Review card + Again → back in 10 minutes, marked relearning, lapse count +1, ease −0.20 (never below 1.3).
- Relearning + Again → 10 minutes again; Hard → 15 minutes. Neither adds a lapse or changes ease.
- Relearning + Good → back in review, due in 1 day; Easy → back in review, due in 2 days.
- The saved grade result reports the card's lapse count.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 4: Learning and relearning cards come first in the everyday review queue — asked

When the learner opens the Review page with no topic, tag or bit chosen, cards already in their minute steps are served before due review cards and new cards.

What to verify:
- Order is: learning/relearning cards that are due (earliest first), then due review cards, then new cards.
- The "Learning" count shows how many learning/relearning cards are due now or within the next 20 minutes, and they are not also counted as due reviews.
- A topic-, tag- or bit-scoped review keeps its existing order.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 5: A learning card due within 20 minutes is served early when nothing else is left — added

Kept because the asked steps would otherwise fail: without it, failing the last card of a sitting shows "done for today" while that card returns a minute later, and the learner leaves.

What to verify:
- With no due review or new cards left, learning/relearning cards due within the next 20 minutes are served, earliest first.
- A learning card due more than 20 minutes out is not served early; the done screen shows its due time.
- Early cards only fill space left after due and new cards, never displace them.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 6: Grade buttons show minute-level next intervals — asked

Each grade button's preview reflects the learning rules, so a new card shows 1m / 6m / 10m / 4d and a relearning card shows 10m / 15m / 1d / 2d.

What to verify:
- New card and first step: Again 1m, Hard about 6m, Good 10m, Easy 4d.
- Last learning step: 1m / 10m / 1d / 4d. Review card: Again shows 10m.
- Each preview equals what the grade actually schedules.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

## Technical/Architectural Scenarios

SCENARIO 7: Existing schedules keep working after the upgrade — asked

The schema change that stores the step state treats every bit that already has a schedule as a plain review card with no lapses, so nothing in anyone's existing deck changes.

What to verify:
- After the upgrade every existing schedule reads as in review, first step, zero lapses, with the same ease, interval and due date as before.
- The upgrade adds the new state without rewriting or blocking the table for longer than a moment.
- The previous API version keeps working against the upgraded table during the deploy window.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 8: A typed answer ends any learning step — added

Kept because the typed mode shares the same schedule: without it, a typed answer would leave a card stuck in a learning step its own formula never advances.

What to verify:
- A typed-mode verdict on a learning or relearning card puts it back in review using the typed formula.
- A typed verdict never changes the lapse count.
- Concurrent typed and Anki grades of one bit still apply one after the other.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)

SCENARIO 9: The prior-schedule copy kept with each grade includes the step state — added

Kept because the history copy is the data contract undo restores from: without step state in it, an undone learning grade could not be restored faithfully.

What to verify:
- Each saved grade's prior-schedule copy holds phase, learning step and lapse count alongside ease, interval and due date.
- Copies written before this change, which lack those keys, still read without error.

Acceptance:
- [ ] Pending implementation (file:line citations added by /implement-ie)
