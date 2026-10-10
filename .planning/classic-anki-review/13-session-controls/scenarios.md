---
type: scenarios
branch: learn-from-doc-site
task: F-session — in-session controls (items 13, 14, 16, 17, 18)
state: confirmed
updated: 2026-10-10
---
# Scenarios: F-session — in-session controls

## Business Scenarios

SCENARIO 1: Undo the last grade — asked

The learner grades a card, then clicks Undo or presses Z (or Ctrl/Cmd+Z). The grade is taken back and the same card comes back to the front of the session, question side up.

What to verify:
- The card's next review date, ease, learning state and failure count are exactly what they were before that grade.
- Pressing Undo repeatedly walks back through the session's grades and suspend/bury actions, newest first, until none are left. With nothing left to undo, the button is disabled.
- An undone grade of a never-reviewed card gives that card back its "new" status, and it no longer counts toward today's new-card limit.
- Undo also works from the done-for-today screen, and it brings the card back for review.

SCENARIO 2: Undo is refused once the card was reviewed again elsewhere — asked

After the Anki grade, the same card was answered in typed mode or graded in another tab. The learner then presses Undo in this session, and the grade is not taken back.

What to verify:
- The learner sees "That grade can't be undone any more, because the card was reviewed again since." The card's schedule is left untouched.
- Only that one entry is dropped from the undo list. Older entries for other cards can still be undone.
- Pressing Undo twice for the same grade (for example, a retry after a lost response) never restores the schedule twice.

SCENARIO 3: Session progress is visible while reviewing — asked

While reviewing, a progress line shows how many cards the learner has done in this session and roughly how many are left.

What to verify:
- The done count goes up after each grade, suspend or bury, and goes down after an undo.
- The "left" figure matches the due and new counts shown on the page, and is never negative.
- The progress line is hidden until the first card loads.

SCENARIO 4: End-of-session summary — asked

When the queue runs out, or when the learner clicks "End session", they see a summary of this session.

What to verify:
- The summary shows cards reviewed, the count for each of Again/Hard/Good/Easy, the share recalled (anything but Again), new cards studied, total time and average time per card.
- It also lists how many cards were suspended, buried, edited or flagged as leeches in this session.
- A session with no actions shows no summary. The done screen looks as it does today.
- "Keep reviewing" returns to the current card with nothing lost. An undo from the done screen updates the summary.

SCENARIO 5: Edit a card's question or answer mid-review — asked

After revealing the answer, the learner clicks Edit (or presses E), fixes the question or answer, and saves. The card stays on screen, revealed, with the new text, ready to grade.

What to verify:
- The new text shows at once. Grading, a later reappearance of the card in this session, and an undo that brings it back all use the edited version.
- Edits are allowed for approved and not-yet-approved bits, and refused for rejected ones. If the card was changed or removed elsewhere, a message appears and the typed text stays in the editor.
- While the editor is open, review shortcuts do nothing. Esc cancels the edit, Ctrl/Cmd+Enter saves it, and an empty question or answer can't be saved.
- Time spent in the editor is not counted as answer time.

SCENARIO 6: Suspend a card — asked

The learner clicks Suspend (or presses @) on a card. It leaves the session and stops appearing in either review mode until it is unsuspended.

What to verify:
- The suspended card is never served again: not in Anki review, not in typed answer mode, not in a scoped review, and not in a later batch.
- It no longer counts toward any topic's or module's due badge.
- Suspending a never-reviewed card keeps it "new". Once unsuspended, it is served as a new card again.
- Unsuspending is possible through the API only. There is no on-screen control for it in this feature.

SCENARIO 7: Bury a card until tomorrow — asked

The learner clicks Bury (or presses -) on a card. It leaves the session and comes back on the learner's next local day.

What to verify:
- A buried card is not served, and does not count as due, until midnight in the learner's own time zone.
- After that, it is served again with its schedule unchanged, as long as it is due.
- Burying a never-reviewed card keeps it "new", and burying does not count toward today's new-card limit.

SCENARIO 8: Undo a suspend or bury — added (kept: there is no on-screen unsuspend, so one stray key press would otherwise hide a card for good)

Right after suspending or burying a card, the learner presses Undo. The card is back in rotation and back on screen.

What to verify:
- The card is shown again, question side up, and the suspend or bury is cleared on the server.
- Suspend, bury and grade entries share one undo list, in the order they happened.

SCENARIO 9: Leeches are flagged and suspended automatically — asked

A card forgotten (graded Again during review) for the 8th time is marked a leech and suspended automatically. The learner is told why.

What to verify:
- On the 8th forgetting, a notice says the card was suspended as a leech and suggests rewriting it. Undo takes back both the grade and the suspension.
- Again during a learning or relearning step does not count as forgetting.
- If the learner unsuspends a leech, it is served with a visible "Leech" marker, and it is suspended again at the 12th, 16th (and so on) forgetting, not on every failure.
- The summary counts leeches flagged in this session.

## Technical/Architectural Scenarios

SCENARIO 10: Undo, grade and suspend of one card never interleave — asked

Two actions on the same card arriving at once (an undo racing a grade from another tab, or a suspend racing an undo) are applied one after the other, never mixed.

What to verify:
- An undo racing a later grade of the same card either takes back the earlier grade before the new one lands, or is refused. It never restores a stale schedule over the newer grade.
- A failed undo, suspend or bury changes nothing: the schedule and history stay as they were.

SCENARIO 11: Typed answer mode keeps working, minus suspended and buried cards — asked

Typed answer mode grades and schedules exactly as before. The only change is that it now skips suspended and buried cards, as the brief's due-queue rule requires for both modes.

What to verify:
- A typed answer on a card still moves its schedule by the typed rule, and leaves any suspension or bury in place.
- The typed queue skips suspended cards and cards buried until a later time. A card whose bury has expired is served again.
