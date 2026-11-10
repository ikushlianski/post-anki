PART 1/3

# Product improvement candidates, round 2

Method: I read every Scope and every item (open and ticked) of spaced-repetition-scheduling, classic-anki-review, prose-knowledge-fisher, load-failure-recovery and data-export in `.planning/TODO.md`. I also read `.product/PRINCIPLES.md` and `.product/REJECTED.md`, then the review screen, schedule rules, queue, export, settings and error paths in the code. Paths are repo-root relative.

Nothing repeats this session's built items. Nothing touches `apps/api/src/knowledge-source/knowledge-source-processed.*` or `apps/api/src/knowledge-bit/knowledge-bit-approval-entries.repo.ts`. No item needs credentials or an LLM call, and none adds gamification or nudges. Items are ranked by user impact.

Checked and dropped (no defect found):
- SM-2 ease floor and cap: `apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts:4-5` and `:74-78` clamp correctly.
- Lapse handling: `knowledge-bit-grade-schedule.ts:80-90`, plus the leech rule in `knowledge-bit-grade-schedule-leech.ts`.
- Undo rules: `knowledge-bit-review-undo.ts:48-70`.
- New-card day window: `apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts:36-50` uses the learner's zone.
- CSV escaping in the export.

One observation is left out because it is too wide for a Simple item. A review card becomes due at the exact minute it was graded, not at the start of its due day. That touches four queries: `knowledge-bit-grade-schedule.ts:104`, `knowledge-bit-review-queue-cards.repo.ts:151`, `knowledge-bit-review-queue-counts.repo.ts:17` and `subject-review-due-counts.repo.ts:33`.

## 1. Make review shortcuts work on a Russian keyboard layout

- Problem today: the review screen reads the typed letter, not the physical key. With a Russian layout active, Z (undo), E (edit) and Shift+2 (suspend) do nothing. Space, 1-4 and minus still work, so the failure looks random. Cards and pasted material are often Russian, so this is the normal case.
- Evidence:
  - `apps/web/src/knowledge-bit/anki-review-keyboard.ts:44` (`event.key === 'z'`).
  - `anki-review-keyboard.ts:56` (`'@'`, which is Shift+2 on a US layout only).
  - `anki-review-keyboard.ts:64` (`'e'`).
  - The event facts passed in carry only `key` (`:93`), no `code`.
  - Russian text is the stated working language in `.planning/TODO.md` (classic-anki-review item "Compare the five models side by side on the user's Russian text").
  - Same dependence in `apps/web/src/knowledge-bit/knowledge-overview-keyboard.ts:42` (`event.key.toLowerCase() === 'a'` for select all).
- Fix: add the physical `code` to the key facts. Match `KeyZ`, `KeyE`, `Digit2` with shift and `Minus`, falling back to `key` when `code` is missing. Do the same for select-all on All cards. Extend the existing keyboard unit tests with a Cyrillic `key` and Latin `code` case.
- Direction: classic-anki-review
- Complexity: Simple
- Backlog line: Review shortcuts for undo, edit and suspend work on a Russian keyboard layout.

## 2. Tell the learner when a settings change fails to save

- Problem today: if a settings save fails, nothing is shown. The page sets itself busy before the save and clears it only on success. After one failure every control stays greyed out until a reload. The new-card limit box also already shows the new number, so the learner thinks it saved. The whole page also refuses to load if the unrelated placement-suggestions or board calls fail, which blocks changing the daily limit.
- Evidence:
  - `apps/web/src/routes/admin-settings.tsx:36-61`: four handlers do `setBusy(true)`, awaited update, `setBusy(false)`, with no try/catch and no error state.
  - `admin-settings.tsx:19-27`: one `Promise.all` of settings, placement suggestions and board in the loader.
  - `apps/web/src/admin-settings/new-cards-per-day-field.tsx:29` overwrites the draft before the save result is known.
  - The update call throws on failure via `apps/web/src/curriculum/api-client.ts:2081-2088`.
  - The guarded-load pattern to reuse is `settle` in `apps/web/src/routes/index.tsx:31-47`.
- Fix: wrap the four saves in one helper with try/catch/finally that always clears busy. Show a plain "Could not save, try again" line next to the control and restore the field's last saved value. Load the placement panel's data with `settle`, so a failure there shows a small note in that section only.
- Direction: load-failure-recovery
- Complexity: Simple
- Backlog line: Settings show a clear message when a save fails and never lock the page.

PART 2/3

## 3. Count today's reviews and the streak by the learner's local day

- Problem today: the "reviewed today" number and day streak on the done screen are stored per UTC date. Near midnight the counter starts a new day at the wrong hour (3 a.m. in UTC+3, for example). The look-back loop mixes local date arithmetic with UTC date text, so around the day boundary a day can be counted twice or skipped, and the streak can reset or inflate. This is the one place "today" disagrees with the new-card limit, which uses the learner's zone.
- Evidence:
  - `apps/web/src/knowledge-bit/daily-review-storage.ts:2` (`new Date().toISOString().slice(0, 10)` is the UTC date).
  - `daily-review-storage.ts:5-11`: `setDate` shifts the local date, then `toISOString()` converts back to UTC.
  - `daily-review-storage.ts:27-43`: the streak walks those keys.
  - Used at `apps/web/src/knowledge-bit/anki-review-done.tsx:60-61`.
  - For comparison, `apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts:41` uses the learner's zone.
- Fix: build the key from the local year, month and day in one helper, used by both today and the look-back. Add unit tests that pin the clock to 23:30 and 00:30 in a non-UTC zone. Old keys can stay as they are.
- Direction: classic-anki-review
- Complexity: Simple
- Backlog line: Today's review count and streak follow the learner's own midnight, not UTC.

## 4. Include topic, tags, added date and every question in the card export

- Problem today: the export has question, answer, example, subject, source link and schedule, but not the topic, tags or added date. Only one question per card is exported, so a fill-in-the-blank variant is lost. The CSV has no byte-order mark, so Excel and Numbers commonly show Russian text garbled.
- Evidence:
  - `apps/api/src/knowledge-bit/knowledge-bit-export.repo.ts:28-43`: the exported fields lack topic, tags, created date and extra variants.
  - `knowledge-bit-export.repo.ts:96` joins `topics` but never selects a name.
  - `knowledge-bit-export.repo.ts:141-149` keeps one variant per card via `pickPreferredVariants`.
  - Tags live in `tagAssignments` (`apps/api/src/db/schema.ts:840-848`, node type `knowledgeBit` as used at `apps/api/src/knowledge-bit/knowledge-bit-review-queue-picked.repo.ts:39`). `createdAt` is at `schema.ts:1142`.
  - CSV columns are fixed at `apps/api/src/knowledge-bit/knowledge-bit-export.csv.ts:3-17`. The header has no BOM (`:32-34`), and the controller sets only a charset header (`apps/api/src/knowledge-bit/knowledge-bit-export.controller.ts:51`).
  - The Excel/BOM claim is an assumption (widely documented behaviour, not checked here).
- Fix: add `topic`, `tags` and `added_at` columns, and the same fields in JSON. Load tags per 200-card batch in one query, like the review history. Add an `other_questions` list of the remaining current variants. Start the CSV with a UTF-8 BOM. Extend the existing export tests.
- Direction: data-export
- Complexity: Simple
- Backlog line: Card export includes topic, tags, added date and every question, and opens cleanly in Excel.

PART 3/3

## 5. Add a Retry button to the All cards and suspended cards error screens

- Problem today: when the card list fails to load, both pages show one red line and nothing else. On All cards the search, subject filter and Download links also disappear. The only way forward is a manual reload. The review and typed-answer screens already offer Retry, so these two are inconsistent.
- Evidence:
  - `apps/web/src/knowledge-bit/knowledge-overview-screen.tsx:65-73` (message only).
  - `apps/web/src/knowledge-bit/suspended-cards-screen.tsx:104-111` (message only).
  - Both queries expose `refetch` (`apps/web/src/knowledge-bit/use-knowledge-overview-data.ts:30-51`, `suspended-cards-screen.tsx:18-34`).
  - Pattern to copy: `apps/web/src/knowledge-bit/anki-review-screen.tsx:146-158`.
- Fix: add a Retry button calling `refetch` to both error states, with a plain sentence ("Could not load your cards. Check your connection and try again."). Keep the Download links visible on the All cards error state.
- Direction: load-failure-recovery
- Complexity: Simple
- Backlog line: A failed card list offers Retry instead of a dead-end message.

## 6. Let the learner skip a typed question and submit with the keyboard

- Problem today: in typed-answer mode, the only way past a question you cannot answer is to type something and pay for a grading call. Skip appears only after a grading failure. The answer box has no keyboard submit, though the review screen is fully keyboard driven. This conflicts with the "learner decides what counts as a gap" principle, because there is no free "not now" choice.
- Evidence:
  - `apps/web/src/routes/knowledge.answer.tsx:154-171`: the textarea has no key handler, Submit is disabled for empty text, and there is no skip control.
  - `knowledge.answer.tsx:192-215`: Skip exists only inside the grading-failure branch.
  - `next()` already clears the draft and moves on (`:89-103`).
  - Every submit incurs grading cost: `apps/api/src/knowledge-bit/grade-knowledge-bit-variant-answer.controller.ts:16-30`.
- Fix: add a quiet "Skip for now" button beside Submit that calls the existing `next()` without grading or recording anything. Submit on Ctrl or Cmd plus Enter inside the answer box. Add both cases to `apps/web/src/routes/-knowledge.answer.test.tsx`.
- Direction: prose-knowledge-fisher
- Complexity: Simple
- Backlog line: Typed-answer mode lets the learner skip a question and submit with Ctrl+Enter.

END-OF-REPORT
