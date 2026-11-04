---
type: scenarios
branch: learn-from-doc-site
task: Extraction failure visibility
state: confirmed
updated: 2026-10-25
---
# Scenarios: Extraction failure visibility

## Business Scenarios

### S1 Rejected cards still reach triage (asked)
Given the AI wrote a card the checks reject (for example it refers to "the note"). When extraction finishes. Then the card appears in Knowledge triage under its note with an amber "Needs manual review" banner and the plain reason; the user can edit and approve it.
What to verify:
- The note does not end as failed when at least one card exists.
- Banner names the reason in plain words.
- Edited and approved card enters the review queue.
- Bulk approve leaves flagged cards untouched.

### S2 Mixed note (asked)
Given a note yields two clean cards and one rejected card. Then all three show, the rejected one flagged, the clean ones normal.
What to verify:
- Clean cards carry no banner.
- Flag clears once approved.

### S3 AI returned nothing (asked)
Given the AI returned no cards for a note. Then Knowledge triage shows a "Needs attention" notice with the note's first words, how long ago, the reason "could not produce a usable card", and Retry now, Edit text and retry, Discard.
What to verify:
- Notice shows without opening anything else.
- The note text is readable from the notice.
- Sidebar triage count includes the notice.

### S4 Retry now (asked)
Given a failed notice. When the user taps Retry now. Then the notice shows "Retrying" and is replaced by cards, or by a fresh notice if it fails again.
What to verify:
- Notice disappears only after the new run finishes.
- A second failure shows again with the new time.

### S5 Edit text and retry (asked)
Given a failed notice. When the user edits the text and confirms. Then the note's text is replaced and extraction restarts. An over-long edit is refused with a message and nothing changes.
What to verify:
- Replaced text is what the AI reads.
- Empty or over 50,000 characters is rejected inline.

### S6 Discard (asked)
Given a notice. When the user discards and confirms. Then the note and notice are gone and the sidebar count drops.
What to verify:
- Confirm step exists and states the text will be deleted.
- Cancel keeps the notice.

### S7 Finished with zero cards (asked)
Given a note finished but produced no live cards and was not marked done. Then it shows as a notice "found nothing to turn into a card" with the same three actions.
What to verify:
- A note whose cards were all approved or rejected by the user does not show a notice.

### S8 Stuck or waiting (asked)
Given a note in processing for over 20 minutes. Then a "Still working" notice offers Retry now, which takes the note over. Given the AI service is rate limited and the note is waiting, then triage says the service is busy, as information, not as a failure.
What to verify:
- A note processing under 20 minutes shows no alarm.
- Retry on a stuck note works.

### S9 Every failure code has wording (asked)
Each stored failure code, and any unknown or free-text one, appears as plain language; raw codes or error text never show.
What to verify:
- Unknown reason falls back to the generic wording.

### S10 Add knowledge and sidebar signals (asked)
Given the user adds a note. Then the success message says cards appear in Knowledge triage and that problems will show there. When any notice exists the sidebar shows the count plus an attention dot, even when no cards are pending.
What to verify:
- Badge never reads empty while a notice exists.

### S11 Notices persist (asked)
A notice stays across reloads and days until retried, edited, or discarded.

## Technical/Architectural Scenarios
- Flagged rows survive a retry of the same note: retry replaces them with the new run's cards.
- iOS pending list is unchanged by attention entries.
- A repeated failure after Retry does not create duplicate notices.
