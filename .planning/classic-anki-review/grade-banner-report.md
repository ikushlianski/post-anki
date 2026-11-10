# Grade banner, scale hint and note fields (2026-10-11)

Task: remove the scale hint everywhere, skip the decision banner for already graded cards, make the optional splitting notes textareas. apps/web only; nothing committed; no API, migration or database change.

## What changed

- Scale hint removed: the text '1 poor, 5 excellent' and the unused `showScale` prop are gone from `knowledge-bit-grade-control.tsx` and both callers (`knowledge-bit-review-card-grades.tsx`, `knowledge-bit-review-decision-strip.tsx`). A repo-wide search (apps, packages, docs) finds no other occurrence; the compare page grade picker never had a scale caption. Buttons keep `aria-label` 'Label: N of 5'.
- Decision banner: `useDecisionFeedback.show` opens no strip when the decision is 'approved' and the card already has a card-quality grade. For 'rejected' the strip still opens (reason chips, note, Undo) but the Card quality and Question wording rows are not rendered when the card was graded before the decision (uses the opened prompt's grade, so grades given inside the strip stay visible). New `gradable` flag on the hook; the 1 to 5 key handler in the panel ignores keys when the opened card was already graded, ungraded cards behave as before.
- Notes are textareas: the per-source extraction grade note (`knowledge-bit-review-extraction-grade.tsx`) is now a 2-row `textarea` with the borderless card field style, `resize-y`, 44px minimum on phones, saves on blur, 800 ms after the last keystroke, and immediately with Cmd/Ctrl+Enter; Enter inserts a newline. The reject strip note is a one-row growing `textarea` (Cmd/Ctrl+Enter commits). The compare page note was already a `textarea` with autosave; it now has `resize-y` and the 44px phone minimum (no Cmd/Ctrl+Enter there: its autosave hook has no save-now entry point).

## Tests (real output)

- `npx tsc --noEmit` in apps/web: exit 0.
- `npx vitest run` in apps/web: Test Files 175 passed (175), Tests 1169 passed (1169).
- New or rewritten: approved graded card shows no banner; approved ungraded card shows it with grade rows; rejected graded card keeps reasons and Undo without grade rows and ignores the number keys; rejected ungraded card shows everything; Enter in the splitting note keeps a new line and does not save; the note saves by itself after a pause; the grade control test now asserts no scale caption.

## Not verified in a real browser

`node scripts/phone-layout-check.mjs --seed` refused to run: the dev database holds one knowledge source created at 20:10 (the user's own test: approved cards and grades), and the script, by design, only seeds into an empty source table. I did not clear it. The real-browser check of 'grade then approve shows no banner' therefore was not run; the behavior is covered by the jsdom tests above. Run the phone check after the user's test data is cleared or with `node scripts/phone-layout-check.mjs` (without --seed it reports 'NOT VERIFIED' for the approve screen when no cards are pending).

## Left open

- Cmd/Ctrl+Enter immediate save on the compare page note.
- Phone check and the real-browser grade then approve scenario after the dev database is free.

## Review round 1 (2 High, 4 Medium, all verified in the code and fixed)

Files changed: `knowledge-bit-review-decision-feedback.ts`, `knowledge-bit-review-decision-strip.tsx`, `knowledge-bit-review-extraction-grade.tsx`; new tests `knowledge-bit-review-panel.notes.test.tsx` (7) and `knowledge-bit-review-extraction-grade.test.tsx` (3). No API, schema or migration change.

- High 1 (reject note lost): confirmed. The hook now keeps the saved note, flushes any pending note before the strip closes, is dismissed, is replaced by another decision (`show`) or the hook unmounts, saves a note typed before any reason with a note-only update, and pauses the 10 s auto-close while the textarea is focused or holds unsaved text (new `noteFocus` on the hook, wired to the textarea focus and blur).
- High 2 (splitting note lost on unmount): confirmed. The extraction grade keeps the latest rating, note and `onSave` in a ref and sends the note once in an unmount cleanup when it is dirty and a rating is set.
- Medium 3 (double save): confirmed. The pause timer rechecks the saved note before saving, so Cmd/Ctrl+Enter followed by the timer saves once.
- Medium 4 (grade lost after Undo): confirmed. `undo` merges the strip's current grades into the snapshot's feedback before the panel restores the card, so approving it again shows no banner.
- Medium 5 (cleared note never reaches the server): confirmed on the client only. The shared zod schema already accepts an empty string and the repo (`knowledge-bit-feedback.repo.ts`, update) stores an empty note as null and allows a note-only update on a rejected row, so no schema change was needed. The client now sends `note: ''` when a previously saved note is cleared.
- Medium 6 (failure message from an older decision): confirmed. `save` captures the feedback id at call time and ignores the result (error or success) when another prompt is open.

Failing-first: all 9 new tests failed before the change (only the 'nothing to save on unmount' control passed), all 10 pass after.

Real output:
- `npx tsc --noEmit` in apps/web: exit 0.
- `npx vitest run` in apps/web: Test Files 177 passed (177), Tests 1179 passed (1179).
- Real browser (Playwright against http://localhost:5540, seeded one extra source through the UI, then deleted only that source's rows by id; the user's own source, bits, feedback and grades were counted before and after: 1|2|2|1 both times):
  - A: strip still open after 12 s with a focused note: true; note saved after dismiss: 'keep this note | rejected'.
  - B: note typed, another card rejected without blur: 'second card note | rejected' saved on the replaced decision.
  - C: grade 4 given in the strip, Undo: the card is back and shows 4/5.
  - D: note saved 'to be cleared', then cleared and blurred: note column '<null>'.
- Not covered by the browser run: High 2 (unmount within 800 ms), Medium 3 (double save) and Medium 6 (late failure); they are covered by the new jsdom tests only. Approving a graded card in the browser was not repeated because an approval starts background work (tags, placement) that would leave rows outside the source-scoped cleanup; that behavior is covered by the panel tests.

END-OF-REPORT

