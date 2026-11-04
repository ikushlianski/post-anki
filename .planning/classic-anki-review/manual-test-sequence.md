# Manual test sequence: classic-anki-review

No confirmed scenarios, built from the brief. Contract used: `.planning/classic-anki-review--refusal-reasons/{spec,impl-report}.md`, `.planning/classic-anki-review--duplicate-source-warning/{spec,impl-report}.md`, `.planning/classic-anki-review--card-source-link/{spec,impl-report}.md`.

Shipped: refusal reasons next to the failed block; duplicate-source warning with explicit add-again; source link on every card in review and All cards.

## Start the local environment

Lane `dev`, ports from `~/.claude/devports` (registry says: web 5540, API 5560, DB 5562, electric 5561). Check first, launch only what is missing.

```bash
node ~/.claude/devports/cli.mjs resolve post-anki --json
lsof -i :5540 -sTCP:LISTEN
lsof -i :5560 -sTCP:LISTEN
docker ps --filter name=post-anki-dev-db
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5540/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5560/
```

If web and API both answer and the listener's cwd is this repo, reuse them and skip launching. If either is missing, from the repo root run `npm run dev:apps` (API + web) with the DB container already up. Do not relaunch a healthy piece.

Chrome extension (needed for step 9): `cd apps/extension && npm run build`, then open `chrome://extensions`, enable Developer mode, "Load unpacked", pick `apps/extension/dist`.

## Before you start

- Web: http://localhost:5540, API: http://localhost:5560.
- The local dev DB has no knowledge sources and no cards (see Data gap check). Group 1 creates everything the later groups use, so run in order.
- Pages: http://localhost:5540/add-knowledge (add), http://localhost:5540/knowledge/review (review), http://localhost:5540/knowledge (All cards), http://localhost:5540/knowledge-bit-review (approval page).
- Use one subject for the whole run; pick or create it in the add form.

## Group 1: Add knowledge, refusal reasons (reversible, no model cost until a source saves)

1. Action: open http://localhost:5540/add-knowledge. In block 1 choose "Add link" and type `http://localhost:1/nothing`. Click "Add knowledge". Expect: block 1 stays in the form with "That page could not be opened." directly under it (`knowledge-block-error-0`).
2. Action: in the same form, add a second block with a short text (a few sentences) and also a third block with 50,001+ characters of text (paste a long generated string). Click "Add knowledge". Expect: the long block shows "This text is longer than 50,000 characters. Split it into smaller blocks." under its own block; the short block is saved and leaves the form; the blocks still on screen are renumbered, and each reason sits under the block as displayed.
3. Action: edit the long block down to a short paragraph and click "Add knowledge". Expect: it saves and the form clears. This text is now the first stored source (used in Group 2).

## Group 2: Duplicate warning (reversible; adds are local rows)

4. Action: on /add-knowledge paste the exact same short text from step 3 into a block and click "Add knowledge". Expect: the block stays with "Already added on <date>." (`knowledge-block-duplicate-0`), a link to the approval page `/knowledge-bit-review`, and an "Add again" button. Nothing new is saved.
5. Action: click the approval-page link in the warning. Expect: http://localhost:5540/knowledge-bit-review opens (it has no per-source anchor, so the earlier source is found by its text in the list).
6. Action: go back, retype the repeated text into the block, then edit one character in it. Expect: the warning and the "Add again" button disappear as soon as the block is edited.
7. Action: paste the original text again (unedited), see the warning, then click "Add again". Expect: the block is submitted with force and saves; the form clears. A second source with the same text now exists.
8. Action: add a batch of two blocks: the same text again plus a brand-new text. Expect: the repeated block shows the warning with "Add again"; the new block shows the generic "could not be added. Try again." (the batch is refused whole). Click "Add again" on the repeated block. Expect: both blocks save.

## Group 3: Extension DUP badge (reversible; manual, loaded unpacked)

9. Action: with the unpacked extension loaded, open any page, select the exact text saved in step 3 so the capture matches the stored text (the extension compares text as stored, including the page title prefix, so first capture the selection once, then capture the same selection again). Expect on the second capture: the toolbar badge shows "DUP" and the title reads "Already added: this selection is already in post-anki". There is no add-again action in the extension.

## Group 4: Source link on cards (needs a card; produced by saving a source with a link)

Prerequisite chain: a card with a source link comes from approving a bit extracted from a link source. Step 10 produces it.

10. Action: add a link source whose URL is reachable locally and has text, e.g. a page served on localhost that you control, then open http://localhost:5540/knowledge-bit-review and approve at least one bit from it so a non-AI card exists. Expect: the card appears in http://localhost:5540/knowledge. (If no local page is available, this step cannot run; see Data gap check.)
11. Action: open http://localhost:5540/knowledge. Expect: the row of the new card shows "Source: <host>" in its answer cell, as a link.
12. Action: click that link. Expect: it opens the source in a new tab (`target=_blank`).
13. Action: open http://localhost:5540/knowledge/review, reach the new card, and click to reveal the answer. Expect: "Source: <host>" appears under the revealed answer for this non-AI card; before reveal it is not shown.
14. Action: find a card with no source link (for example one made from pasted text). Expect: no "Source:" line in review or in its All cards row.

## Group 5: Russian layout shortcuts and local-day count (reversible)

15. Action: switch the keyboard to the Russian layout, open http://localhost:5540/knowledge/review, and press the key in the Z position (Я). Expect: the last grade is undone, same as Z on the English layout.
16. Action: on the Russian layout press the key in the E position (У), the Shift+2 key, and the Minus key. Expect: edit, suspend and bury work as on the English layout.
17. Action: switch back to the English layout and press Z, E, Shift+2 and Minus. Expect: the same actions as before; plain 2 still grades Hard.
18. Action: click into a text field (for example the edit box) and type Russian letters. Expect: no shortcut fires while typing.
19. Action: grade one card, then change the computer clock to 23:59, grade one, wait for 00:01 and grade another. Expect: the reviewed-today count restarts at the local midnight and the streak continues across it. Restore the clock afterwards. The first local day after the change may show a lower count.

## Not verifiable through the product UI

- Unsafe addresses (`javascript:`, `data:`) showing no link: covered by `apps/web/src/knowledge-bit/anki-review-card.test.tsx` and `knowledge-overview-table.test.tsx`; an unsafe stored link cannot be created from the UI.
- Server answering 409 `already_added` with `existingId`, and `force` on all three input shapes: `cd apps/api && npx vitest run src/knowledge-source`; raw API check would need curl against http://localhost:5560.
- `subject_not_found` sentence and `empty_content` sentence ("That page has no readable text."): covered by `apps/api/src/knowledge-source/knowledge-source.controller.refusals.test.ts`; no UI path deletes a subject mid-submit.
- Truncation notice "Only the first 50,000 characters of the page were read.": needs a link to a page over 50,000 characters; covered by the same refusals test. Add it as a UI step only once a long local page exists.
- Repo duplicate queries against Postgres and the overview `sourceLinks` select: impl reports state the DB-backed integration tests were not run; run them with the DB up.

## Data gap check

Checked with a read-only count on the local dev DB (container `post-anki-dev-db`): `select (select count(*) from knowledge_sources),(select count(*) from knowledge_bits)` returned 0 and 0. Nothing was patched.

- No knowledge sources: Group 1 and 2 create their own sources in-sequence, so no seed is needed for them. Not fixed.
- No cards: Group 4 depends on step 10 producing a card; this needs a locally reachable page with text. Not fixed.
- No local page longer than 50,000 characters: the URL-truncation notice is not in the sequence. Not fixed.
- Example rows: none exist to cite. Once data exists, the newest source is fetched with `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select id, created_at from knowledge_sources order by created_at desc limit 1"`, picked as the most recent by created time descending; same shape with `knowledge_bits` for the newest card.
- Not testable locally: none. Every step above runs on localhost.

END-OF-REPORT
