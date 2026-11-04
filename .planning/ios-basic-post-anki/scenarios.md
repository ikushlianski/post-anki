---
type: scenarios
branch: learn-from-doc-site
task: iOS basic post-anki — triage, add knowledge, inbox, review
state: confirmed
updated: 2026-10-24
---
# Scenarios: iOS basic post-anki

The iPhone app already lets you add text, see pending items, approve or reject them in a list, and review due cards with grades, undo and offline saving. These scenarios cover only what is missing compared with the web app.

## Business Scenarios

SCENARIO 1: Triage pending cards one at a time — asked

From the Knowledge Inbox the user taps Start triage and sees one suggested card at a time: every question variation listed open, the example, then the fact underneath, and a Reject and an Approve button. Each tap saves the decision on the server straight away and the next card appears.

What to verify:
- All question variations of the card are visible without extra taps; the fact sits below them.
- Approve keeps every variation; Reject removes the card; each tap is saved before the next card shows.
- Approve is unavailable while a card has no questions yet; Reject still works.
- A failed save (offline, rejected token) keeps the card on screen with a plain message; a card already decided elsewhere is skipped with a notice.

SCENARIO 2: Undo the last decision — asked

While triaging, the user taps Undo and the most recently approved or rejected card comes back as the current card, pending again on the server. Repeated taps walk back further through this session's decisions.

What to verify:
- Undo works for both approved and rejected cards, any time during the session.
- The restored card becomes the current card and leaves the session's decision tally.
- If the server says the card changed since, Undo shows a message and the card stays decided; offline lets the user try again.

SCENARIO 3: Leave an optional note on a card — asked

Before deciding, the user can type a short note (why approve or reject). The note is saved together with the decision and helps future card writing.

What to verify:
- The note field is optional and capped at 500 characters.
- A note on Approve and a note on Reject both reach the server after the decision succeeds.
- If the note fails to save, the decision still stands and a small message says the note was not saved.

SCENARIO 4: Finish triage with optional feedback — asked

The user taps Finish (any time, or when no cards are left), may type free-text feedback about the cards, and finishes. The app shows how many were accepted and rejected and any style notes the server drew from the session.

What to verify:
- Finish is reachable at any time and on the "All cards decided" screen; feedback is optional, capped at 8,000 characters.
- The server receives this session's decisions and the feedback; the result shows accepted and rejected counts and style notes.
- A failed save keeps the typed feedback for a retry; a session the server no longer knows offers Discard.
- Leaving the app mid-session and coming back resumes the same session on the same server.

SCENARIO 5: Cards still being written show up without a manual refresh — asked

Right after adding knowledge some suggestions have no questions yet. Triage shows "Writing cards… N waiting" and the waiting cards appear on their own once ready, without moving the card the user is looking at.

What to verify:
- The waiting count is shown while any pending card has no questions.
- New questions arrive by themselves within about ten seconds of being ready; checking stops after a bounded time.
- The card on screen does not change while the user reads or writes a note.

SCENARIO 6: Add knowledge and go straight to triage — asked

From the Add tab the user picks a subject (or none), pastes text or a single web link, sends it, and taps Review new items, which opens triage directly on the new suggestions as they are written.

What to verify:
- A subject can be chosen when adding from the tab; adding from a course keeps that course's subject.
- A single web link is sent as a link, anything else as text.
- Server refusals show the server's plain reason (already added, subject has sub-subjects, text too long, page can't be opened); "already added" offers Add anyway.
- Review new items opens triage immediately rather than the list.

SCENARIO 7: Knowledge Inbox is easy to find and summarises what is waiting — asked

The Knowledge Inbox is a visible tab with the pending count badge. It opens on a summary ("N cards are waiting for your decision", "Writing cards… x of y ready") with a Start triage button above the existing list, per-source Approve all and placement suggestions.

What to verify:
- The inbox, add knowledge and review are all one tap away from the tab bar on an iPhone.
- The summary counts match the list; Start triage is disabled when nothing is ready.
- Existing list actions (approve, reject with reason, edit, approve all, placements) keep working.

SCENARIO 8: Review shows what is left today — asked

During spaced-repetition review the user sees how many New, Learning and Due cards remain, and the numbers go down as they grade.

What to verify:
- New, Learning and Due counts from the server appear above the card with a one-line legend.
- Grading a new card lowers New; grading any other card lowers Due; Undo puts the count back.
- Counts reset to the server's numbers on every reload; offline grading still lowers them.

## Technical/Architectural Scenarios

SCENARIO 9: Mac app keeps working unchanged — added

The shared screens feed both apps, so the Mac app must build and behave as before (its keep-up-to-two triage stays). Kept because every asked scenario touches shared screens and cannot ship if the Mac build breaks.

What to verify:
- Both apps build; the Mac test suite passes.
- The Mac Knowledge Inbox still opens in its existing triage layout.
