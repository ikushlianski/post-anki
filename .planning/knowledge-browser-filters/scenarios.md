---
type: scenarios
branch: learn-from-doc-site
task: Rich filters, column controls and search by meaning in the knowledge browser
state: confirmed
updated: 2026-10-25
---
# Scenarios: Rich filters, column controls and search by meaning in the knowledge browser

There are two kinds of search. The Question and Answer filters are cheap letter matching: they keep pieces whose text contains the typed letters and never cost money. "Search knowledge" is meaning search: it ranks pieces by how close their meaning is to a typed question or sentence, and each new search makes one paid call to the embedding service.

## Business Scenarios

SCENARIO 1: One toolbar holds everything — asked

One always-visible toolbar at the top of the browser holds, in this order: "Search knowledge", the subject control, the "Filters" button with a count of active filters, the "Columns" menu, then the selection count with Delete and Clear. A second line shows active-filter chips and "Clear all" when any filter is set.

What to verify:
- The toolbar stays at the top while scrolling and is the only bar showing the selected count
- On a wide screen the controls sit on one line and the selection group sits at the right end
- At phone width the search box takes a full line, the subject, Filters and Columns buttons share the next line, and the selection group wraps to its own line; chips scroll sideways on one line
- Delete confirmations appear inside the same toolbar, not as a second bar

SCENARIO 2: Filter Question or Answer text — asked

The owner types letters into the Question filter or the Answer filter, from that column's header or from the Filters panel, and the list keeps only pieces whose text contains them, in any letter case, in Russian as well as English.

What to verify:
- An Answer filter of "карточ" keeps a piece whose answer says "Карточки"; a piece without it disappears
- A Question filter checks every live phrasing of the piece, not only the one shown
- The list refreshes shortly after typing stops and never makes a paid call; "%" and "_" match literally

SCENARIO 3: Filter Source and Added by — asked

The owner ticks one or more source types (Typed in, Pasted text, Article, Notion, AI web search) and, separately, who added the piece (You, AI web search), and sees only pieces matching both.

What to verify:
- Ticking "Article" and "Notion" shows pieces from both and hides the others
- "Added by: You" hides AI web search pieces; combined with Source "AI web search" it shows nothing, with the empty-state message
- Ticking nothing means no limit

SCENARIO 4: Filter Source URL — asked

The owner limits the list to pieces with a source link or without one, and can narrow to one website by typing its address.

What to verify:
- "Has a link" hides pieces without one; "No link" shows only those
- "wikipedia.org" keeps links on en.wikipedia.org and wikipedia.org but not on notwikipedia.org
- Typing a site implies "Has a link"

SCENARIO 5: Filter Date added — asked

The owner sets a from date, a to date or both, and sees pieces added on those days in the owner's own time zone.

What to verify:
- A piece added at 23:30 local time on the "to" day is included
- From later than to shows an inline message and sends no request

SCENARIO 6: Filter by subject — asked

The owner picks a subject in the toolbar's subject control, including "No subject", and sees that subject's pieces plus those of its sub-subjects.

What to verify:
- Picking a parent subject also shows pieces filed under its sub-subjects
- "No subject" shows only unfiled pieces
- Opening the browser from the subjects page link pre-selects that subject

SCENARIO 7: Filter by study state — asked

From the Filters panel the owner ticks study states (New, Learning, Review, Relearning, Suspended, Buried), with the same meanings the study overview uses.

What to verify:
- A never-studied piece counts as New
- A suspended piece counts only as Suspended, whatever its phase

SCENARIO 8: Filters combine, with chips, count and "Load more" — asked

All filters work together. Each active filter shows as a chip that removes it on click, the browser shows how many pieces match in total, and "Load more" continues the same filtered list.

What to verify:
- "Article" plus a date range plus an Answer filter shows only pieces meeting all three, with three chips
- The toolbar shows "N matching pieces" for the whole filtered list, not just the loaded rows
- Loading more never repeats or skips a piece
- A column header shows a marker when that column has an active filter

SCENARIO 9: Show, hide and reset columns — asked

From the Columns menu the owner shows or hides each column. The choice is remembered in this browser like the saved column order, and "Reset columns" restores the default order and visibility.

What to verify:
- Hiding "Source URL" removes it and it stays hidden after a reload
- The last visible column cannot be hidden
- A filter on a hidden column still applies, still shows its chip, and can still be edited in the Filters panel
- "Reset columns" brings back every column in the default order

SCENARIO 10: Filters live in the address — asked

Every filter, and the meaning search words, are kept in the page address, so a reload or a copied link reopens the same view. Column visibility is a personal layout and is not in the address.

What to verify:
- Reloading keeps every filter and the same rows
- A link with an unknown or broken filter value opens with that one filter ignored, not an error page
- Browser back returns to the previous filter set, not to each keystroke

SCENARIO 11: Nothing matches, and clear all — asked

When the filters match nothing, the browser says so and offers to clear every filter at once.

What to verify:
- The message differs from the "No approved knowledge yet" message for an empty collection
- "Clear all" removes every filter, the meaning search included, and shows the full list
- "Clear all" is hidden when no filter is set

SCENARIO 12: Selection follows what is visible — asked

When the filters change, a selected piece stays selected only if it is still shown, and the toolbar says how many were unselected; a delete only ever removes pieces the owner can see selected.

What to verify:
- Selecting three rows, then filtering so one disappears, leaves "2 selected" and a note "1 selected piece is hidden by the filters and was unselected"
- "Select all from this source" adds only the shown pieces from that source
- Shift-click range selection follows the order on screen, including meaning-search order

SCENARIO 13: Deleting a whole source while filtered states the real number — added

The delete-source confirmation states how many pieces the source really holds, including ones hidden by filters or not loaded yet. It stays because filters make the current on-screen count understate what the delete removes.

What to verify:
- A source with 8 pieces, 3 shown under a filter, asks to delete 8 pieces and says some are hidden
- After the delete the count and list refresh

SCENARIO 14: Search knowledge by meaning — asked

The owner types a question or sentence into "Search knowledge", presses Enter, and the browser lists the pieces closest in meaning, closest first, each with a match percentage.

What to verify:
- "how does the heart pump blood" ranks a piece about heart ventricles above an unrelated one even with no shared words
- Pieces below the minimum closeness are left out, and at most the closest 100 are shown, with a note when there are more
- Typing alone makes no call; Enter or the search button does; clearing the box returns to the newest-first list

SCENARIO 15: Meaning search inside the filters, and pieces not ready yet — asked

Meaning search ranks only pieces that pass every other filter and says how many matching pieces could not be searched because they have no meaning data yet.

What to verify:
- With Source "Notion" ticked, every meaning result is a Notion piece
- "4 pieces are not ready for meaning search and are not included" appears when 4 filtered pieces lack meaning data
- Browsing never creates meaning data or calls the paid service for those pieces

SCENARIO 16: Meaning search refuses calmly — asked

When the daily spending limit is reached, the service fails, or searches arrive too fast, meaning search shows a plain message and the rest of the browser keeps working. When nothing is ready or nothing is close, it says so.

What to verify:
- Spending limit: "Meaning search is paused until tomorrow. The column filters still work."
- Service failure: "Could not run the meaning search. Try again." with a retry; too fast: "Too many searches in a row. Wait a moment."
- No ready pieces: "None of these pieces are ready for meaning search yet." with no paid call recorded
- None close enough: "Nothing close to that. Try other words or loosen the filters."

## Technical/Architectural Scenarios

SCENARIO 17: The same search words are not paid for twice — asked

Repeating a meaning search with the same words, after a reload, a filter change or back navigation, reuses the earlier result of the paid call while the server keeps running.

What to verify:
- Changing a filter with the same words records no new paid embedding call
- Different words, or a changed embedding model setting, make a new call
- The paid call is recorded in the existing spending and call log like every other embedding call
