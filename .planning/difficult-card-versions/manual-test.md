# Manual test: reworded versions for difficult cards

Needs the API deployed (the new drafts table migration runs in deploy).

1. Generate drafts without writing: `npm run reword:difficult-cards -w @post-anki/api -- --dry-run --limit 3`. Expect up to 3 difficult Business cards with 2-3 reworded fronts each, none containing the answer.
2. Generate for real: same command without `--dry-run`. Expect a count of stored drafts.
3. Web, Triage page: a "Reworded versions" section lists each draft with the original front, the new front and the answer. Approve one, reject one. Both disappear from the list.
4. Run step 2 again: cards that already have drafts (approved, rejected or failed) are skipped.
5. Review a difficult card that has an approved reworded version: across sessions it alternates between the original and the reworded front, and grading either moves the same schedule.
6. A card that is not difficult never shows a reworded front.
7. Near-duplicates: `npm run list:near-duplicates -w @post-anki/api -- --subject Business` writes `.planning/near-duplicate-cards/report.md` (25 pairs on 2026-11-16).
