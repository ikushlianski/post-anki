---
type: scenarios
branch: learn-from-doc-site
task: Item 4 — Run bit detection and question generation right after paste
state: confirmed
updated: 2026-10-10
---
# Scenarios: Run bit detection and question generation right after paste

## Business Scenarios

SCENARIO 1: Adding knowledge starts processing at once — asked

A learner pastes text, pastes several texts, or imports a link. The save is confirmed as quickly as it is today, and splitting into bits starts at once in the background, followed by question writing and fill-in-the-blank writing. Nothing waits for the 5-minute timer.

What to verify:
- The save response arrives without waiting for any background work.
- The steps run in this order: split into bits, then write questions, then write fill-in-the-blank cards.
- Single paste, multi-paste and link import all start the work.
- Input that is rejected or fails to save never starts the work.

E2E:
- [x] @anki-kick.S1 — paste saves at once, kick runs detect then cards (UI paste + API), bad input starts nothing — projects/post-anki/post-anki/features/anki-review/kick/tests/paste-starts-processing-at-once-without-duplicates.test.ts

SCENARIO 2: Pastes in quick succession never pile up background runs — asked

A learner pastes several times while a background run is still going. Only one run happens at a time. A paste that arrives mid-run is covered by exactly one follow-up run, however many pastes arrived.

What to verify:
- Two background runs never overlap inside one server.
- A paste that arrives after the split step has passed is still processed by the single follow-up run.
- Ten pastes during one run lead to one follow-up run, not ten.
- A paste after everything has finished starts a fresh run.

E2E:
- [x] @anki-kick.S2 — quick pastes: each source processed once, no duplicate work (run count itself not observable) — projects/post-anki/post-anki/features/anki-review/kick/tests/paste-starts-processing-at-once-without-duplicates.test.ts

SCENARIO 3: A background failure never harms the paste or the server — asked

A step fails, for example because the AI provider or the database is down. The learner's save is unaffected, the error is logged, and later steps and later pastes still run.

What to verify:
- The save still succeeds and the content stays saved.
- If one step fails, the steps after it still run in the same run.
- The failure is logged with the step name, and the server never crashes or reports an unhandled error.
- After a failure, the next paste can start a run (the guard never gets stuck "busy").

E2E:
- [x] @anki-kick.S3 — forced step failure: save succeeds, later steps run, next paste works (log line not observable) — projects/post-anki/post-anki/features/anki-review/kick/tests/paste-starts-processing-at-once-without-duplicates.test.ts

## Technical/Architectural Scenarios

SCENARIO 4: The timer job and the after-paste run never process the same item twice — asked

The 5-minute timer job and an after-paste run work at the same time. Each pasted text is split once, and each bit gets at most one question and one fill-in-the-blank card. Total AI usage per item is the same as today; only the timing changes.

What to verify:
- No duplicate bits for one paste, and no duplicate questions or blanks for one bit.
- The side that loses the race skips the item without calling the AI.
- The timer job keeps running unchanged as the safety net.

E2E:
- [x] @anki-kick.S4 — no duplicate bits/cards, LLM calls equal bits (timer-job race not driven) — projects/post-anki/post-anki/features/anki-review/kick/tests/paste-starts-processing-at-once-without-duplicates.test.ts

SCENARIO 5: Interrupted background work is finished by the timer job — asked

The server pauses or shuts down mid-run, for example because the hosting platform throttles CPU after the response or scales to zero. Nothing is lost. The items it held become available again and the timer job processes them, later than an uninterrupted run would.

What to verify:
- An item held by an interrupted run becomes available again after the existing hold timeout and is then processed.
- A shutdown during a run never leaves a partial set of bits for a paste.

E2E:
- [x] @anki-kick.S5 — stale source and stale claim finished by the timer scans; live hold untouched — projects/post-anki/post-anki/features/anki-review/kick/tests/interrupted-run-finished-by-timer-scan.test.ts

Manual verification (real environment):
- [ ] On the deployed service, paste text and note how long it takes for suggestions to appear.
- [ ] Logs show one run summary per run, with no unhandled-rejection entries.
