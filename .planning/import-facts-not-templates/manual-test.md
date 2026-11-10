# Manual test: import facts, not templates

1. Import a small Anki text export with cloze notes (e.g. a few lines of business.txt) into a subject.
   - Expect: triage shows direct what/why/how questions, not whole paragraphs with `[...]`.
   - Expect: Examples never hold the cut-off tail of a sentence.
2. Any cloze card that does appear is one short sentence (200 characters or fewer).
3. Some cards show a web-found example or source link; an import still finishes when search is unavailable.
4. Backfill of old pending cards (from apps/api):
   - `npm run backfill:import-facts` (dry run) lists the sources and counts of pending verbatim-cloze cards.
   - `npm run backfill:import-facts -- --apply --limit 1` rebuilds one source.
   - Expect: its old pending cards are gone from triage, new direct-question cards appear, and approved cards are unchanged.
   - Rerun the dry run: that source no longer shows up.
