---
type: scenarios
branch: learn-from-doc-site
task: Let parent subjects hold cards
state: confirmed
updated: 2026-10-25
---
# Scenarios: Let parent subjects hold cards

## Business Scenarios

SCENARIO 1: Add knowledge straight to a parent subject — asked

The learner adds text, a batch of texts or a link and files it under a subject that has sub-subjects; it is saved under that parent and its cards appear there.

What to verify:
- Text, batch and link adds all succeed with a parent subject chosen, and the source is filed under the parent itself.
- On the web, ticking "Also allow parent subjects" and picking a parent saves without any refusal.
- An unknown subject is still refused with the existing "subject no longer exists" sentence.

SCENARIO 2: Move cards to a parent subject — asked

From the card overview the learner selects cards and moves them to a subject that has sub-subjects; the move succeeds.

What to verify:
- The chosen cards now belong to the parent subject itself, not to any of its sub-subjects.
- Cards placed inside a course are still skipped, and unapproved cards are still skipped, as today.
- An unknown target subject still fails as "not found".

SCENARIO 3: Adding a sub-subject leaves the parent's cards where they are — asked

The learner adds the first sub-subject under a subject that already holds cards (by creating it, moving an existing subject under it, or approving an AI sub-subject suggestion); the parent keeps its cards and no "Common" sub-subject appears.

What to verify:
- After creating the first child, every card the parent held is still on the parent.
- No new "Common" sub-subject is created, for any of the three ways a first child can appear.
- The Business sub-subject seed adds its children without moving the parent's cards.

SCENARIO 4: Existing "Common" sub-subjects stay as they are — asked

A parent that already has a "Common" sub-subject from the old rule keeps it with all its cards; nothing is merged back into the parent.

What to verify:
- After deploy, every existing "Common" sub-subject and its cards are unchanged.
- The learner can rename, merge, move or delete a "Common" sub-subject like any other sub-subject.

SCENARIO 5: A parent's review, counts and browser include its own cards and its sub-subjects' cards — asked

Reviewing, counting or browsing a parent subject shows the parent's own cards together with every descendant's cards, the same roll-up the app already uses.

What to verify:
- A scoped review of the parent includes cards filed directly on the parent and cards in its sub-subjects.
- The parent's due and new counts on the dashboard include its own cards.
- The knowledge browser subject filter and its per-subject totals include the parent's own cards.

SCENARIO 6: Automatic card placement may use a parent subject's course topics — asked

When the app suggests a topic for a new card, topics from courses owned by a parent subject are offered alongside those of sub-subjects.

What to verify:
- Topics of a course that belongs to a parent subject appear in the placement choices.
- The existing cap on how many topics are offered still holds.

SCENARIO 7: AI sub-subject suggestions draw on the parent's own cards — asked

The background job that proposes new sub-subjects groups a parent's cards to suggest splits; it now looks at cards filed directly on the parent, plus any legacy "Common" child's cards.

What to verify:
- A parent with children and enough of its own cards gets sub-subject suggestions.
- A parent whose cards all sit in a legacy "Common" child still gets suggestions, as today.
- A "Common" sub-subject is never itself proposed as a parent for further splits.

## Technical/Architectural Scenarios

SCENARIO 8: Older app builds keep working — asked

Phone and Mac builds already installed still know the old "has sub-subjects" refusal; the server simply never sends it, so they now save to parents without a refusal.

What to verify:
- An installed phone or Mac build adding or moving to a parent gets a normal success answer.
- The client code that maps the old refusal stays in place and its tests still pass.
- No other error answer changes for unknown subjects.
