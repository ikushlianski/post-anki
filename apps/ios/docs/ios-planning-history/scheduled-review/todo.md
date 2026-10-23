## Decisions to make
Nothing to decide.

## To review / clarify
Nothing to review.
- Force-quitting while an undo waits on a send still sends the grade on next launch.
- No progress sign while undo waits on a slow send, up to 60 seconds.
- Grades synced before undo keep no review id, so undo says Already sent though the server could undo.
- An unconfirmed grade later rejected by the server leaves undo saying Already sent instead of restoring the card.
- Confirming an unconfirmed grade can overlap a background send of the same grade; harmless, server dedupes.

## Coding tasks
- [x] Add a Due today screen that loads the review cards due now.
- [x] Show a card's question, reveal its answer, then grade it again, hard, good or easy.
- [x] Show the next review interval on each grade button before it is tapped.
- [x] Let the learner undo the last grade.
- [x] Save grades given offline and send them when the connection returns.
- [x] Add a Home card showing how many reviews are due today, opening the Due today screen.

## Resolved
