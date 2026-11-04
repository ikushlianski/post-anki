---
type: scenarios
branch: learn-from-doc-site
task: Open a piece's full version in a slide-over from the knowledge browser
state: draft
updated: 2026-10-25
---
# Scenarios: Knowledge browser detail slide-over

## Business Scenarios

SCENARIO 1: Click a row to open the full version — asked

The owner clicks anywhere on a row (not on its checkbox, a link or a button) and a panel slides in showing that piece. The row stays highlighted while its piece is open.

What to verify:
- A plain click opens the panel and does not tick the row or change the selected count
- The front, back and phrasings appear immediately from the row; the rest fills in a moment later
- Clicking another row while the panel is open switches the panel to that piece
- Clicking a source link or the source delete button inside a row does not open the panel

SCENARIO 2: Selecting several rows still works — asked

The owner selects rows with the checkbox, shift-click for a range and cmd/ctrl-click to add or remove one, then deletes them as before.

What to verify:
- Shift-click selects the range from the last ticked row; cmd/ctrl-click toggles one row; neither opens the panel
- With rows selected, a plain click still opens the panel and leaves the selection as it was
- "Select all", the selected count and Delete behave exactly as before

SCENARIO 3: The panel shows the whole piece — asked

The panel shows the front and back, then every phrasing with its card type (basic, why-question or fill-in-the-blank), its own answer and, for fill-in-the-blank, the full sentence. Below sit the details: subject path (for example "Programming / Databases / Indexes"), tags, context or example, source type with its link, who added it, date added, and review state (new, learning, review, relearning, suspended or buried, next due date, times forgotten).

What to verify:
- A piece with three phrasings shows all three, each with its own answer, in the same order as the list
- A piece with no tags, no subject or no context shows those rows as "None" or hides them, never as blank or "undefined"
- A suspended piece says suspended and shows no due date; a piece never reviewed says new
- The panel has no edit, delete or move controls

SCENARIO 4: Loading, missing and failed — added

While the extra details load, the panel shows the row's text with placeholders for the rest. If the piece was deleted or the address names an unknown piece, the panel says it no longer exists and offers Close. If loading fails, it shows an error with Retry. Kept because a reload from an address cannot work without these states.

What to verify:
- A piece deleted elsewhere while its panel is open shows the "no longer exists" message after the next refresh
- Retry reloads only the details and keeps the row text on screen
- A made-up id in the address shows the missing message, not a blank panel

SCENARIO 5: Close three ways — asked

Pressing Esc, clicking outside the panel or pressing the close button closes it and puts focus back on the row.

What to verify:
- With rows selected and the panel open, Esc closes only the panel; a second Esc clears the selection
- On a wide screen, clicking another row switches the piece instead of closing
- Closing removes the piece from the address

SCENARIO 6: Reload keeps the open piece — asked

The address holds the open piece, so reloading or sharing the link reopens the same panel with the filters unchanged.

What to verify:
- After reload, the panel shows the same piece even when its row is not on the loaded page
- Changing a filter, the subject or Clear all keeps the panel open
- The open piece does not count as an active filter and does not appear as a chip
- Browser Back after opening closes the panel

SCENARIO 7: The open piece survives refreshes — asked

The panel stays open and stable while the list reloads, loads more, changes filters or runs a meaning search, even if the piece drops out of the visible rows.

What to verify:
- Applying a filter that hides the open piece leaves the panel showing it
- "Load more" and a background refresh do not flicker or reset the panel's scroll position
- Deleting the open piece through selection ends in the "no longer exists" state, not a stale view

SCENARIO 8: Arrow keys move between rows — asked (optional)

With the panel open, Up and Down move to the previous or next visible row and the panel follows. Kept only if it stays a small addition.

What to verify:
- Down on the last visible row does nothing; it does not load more
- Arrow keys do nothing while typing in a filter or search box
- Moving with arrows does not add a history entry per step

SCENARIO 9: Phone sheet — asked

On a phone-width screen the panel fills the full width as a sheet over the page with a dimmed background; tapping the background closes it, and the page behind does not scroll.

What to verify:
- The sheet fills the width, scrolls inside, and its close button is reachable without scrolling
- On a wide screen the panel is a right-hand drawer about 28rem wide with no dimming

## Technical/Architectural Scenarios
None.
