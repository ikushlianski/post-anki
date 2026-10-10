---
type: scenarios
branch: learn-from-doc-site
task: F-basic — basic front/back card variant (item 8)
state: confirmed
updated: 2026-10-10
---
# Scenarios: F-basic — basic front/back card variant

## Business Scenarios

SCENARIO 1: Every bit gets one simple front/back card — asked

Each bit that has not been rejected gets one short front/back card, written by a low-cost AI model with its own plain-recall instructions. It sits next to the bit's why-question and fill-in-the-blank cards.

What to verify:
- The front is a short question or cue that does not give the answer away. The back is the plain fact, based only on the bit's text.
- After a paste, the card appears as part of the after-paste run, without waiting for the 5-minute backstop.
- A bit never has more than one active basic card. Rejected bits get none.

Acceptance:
- [x] @anki-basic.S1 — every bit gets one basic card from the after-paste run — projects/post-anki/post-anki/features/anki-review/kick/tests/paste-starts-processing-at-once-without-duplicates.test.ts
- [ ] pending implementation

SCENARIO 2: The approval page shows the basic card with its own label — asked

On the approval page, each card is labeled by type: "Front / back", "Why question" or "Fill in the blank". The reviewer can edit a basic card's front and back, the same way as the other cards.

What to verify:
- Each card shows its type label. A basic card's two lines read as front and back.
- Editing a basic card saves a new version that is still a basic card.
- Approve becomes available once the bit has any card, including one that has only a basic card so far.

Acceptance:
- [ ] @anki-basic.S2 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 3: Anki review prefers the basic card — asked

When a bit has a basic card, Anki review shows that card. If not, it shows the fill-in-the-blank card, and failing that the why-question. A bit never appears twice in one batch.

What to verify:
- For a bit with all three cards, only the basic card is served.
- A bit without a basic card falls back to fill-in-the-blank, then to why-question.
- When a bit's served card switches to the new basic card, the bit keeps its existing schedule.

Acceptance:
- [x] @anki-basic.S3 — Anki serves basic over blank over why (queue test) — projects/post-anki/post-anki/features/anki-review/queue/tests/unscoped-queue-serves-due-then-new-one-card-per-bit.test.ts
- [ ] pending implementation

SCENARIO 4: Typed answer mode never uses basic cards — asked

Basic cards are for self-graded recall only, so the typed, AI-graded mode never serves them and never counts them.

What to verify:
- The typed queue never returns a basic card, in any scope.
- A topic's "N due" badge does not count a bit whose only card is a basic one.
- If a basic card is sent straight to typed grading, it is refused before any AI grader call, with a clear error.

Acceptance:
- [ ] @anki-basic.S4 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 5: Editing a pending bit's text replaces its basic card — asked

When the reviewer edits a pending bit's own text, its old basic card is removed, or detached if it already has history, and a new one is generated from the new text.

What to verify:
- After the edit, the old basic card disappears from the approval page.
- The next generation run writes a new basic card from the edited text, with a fresh retry budget.

Acceptance:
- [ ] @anki-basic.S5 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 6: Bits approved before this change also get basic cards — asked

When this ships, existing approved bits are picked up by the same generation runs and get a basic card. Anki review then serves that card for them.

What to verify:
- Existing approved bits gain a basic card, at most 50 per run, oldest first.
- These cards go live without a separate review step. Today's why-question and fill-in-the-blank cards behave the same way once a bit is approved.

Acceptance:
- [ ] @anki-basic.S6 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

## Technical/Architectural Scenarios

SCENARIO 7: A failed or malformed card is retried at most three times — asked

A model error, or output that fails the card rules, produces no card and counts as one failed attempt. After three failed attempts the bit is left alone.

What to verify:
- Each of these produces no card: an empty side, an over-long side, a front identical to the back, or a front that contains the answer.
- After three failed attempts, later runs never pick the bit up again.
- One bit's failure never stops the rest of the run.

Acceptance:
- [ ] @anki-basic.S7 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 8: Overlapping runs never pay for or store the same card twice — asked

The 5-minute backstop job, the after-paste run and a long-running earlier run can overlap. Each bit is claimed before any AI call, so only one run works on it.

What to verify:
- When two runs reach the same bit, only one makes the AI call, and the other skips it.
- A run whose claim was taken over after 10 minutes stores nothing. Its card write is rolled back.
- The database still allows at most one active basic card per bit, even if the claim logic has a bug.

Acceptance:
- [ ] @anki-basic.S8 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 9: A scheduled backstop job runs basic-card generation every 5 minutes — asked

A new cloud scheduled job calls the basic-card generation endpoint on the same 5-minute cadence as the other generation jobs. It uses the same shared secret.

What to verify:
- The endpoint rejects calls that have no valid secret or API token.
- A failed run returns an error status with a message, never a silent success.
- The job is defined only in the infrastructure code, with a configurable schedule.

Acceptance:
- [ ] @anki-basic.S9 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation

SCENARIO 10: Instructions hidden in pasted text don't steer the card writer — asked

Pasted text is untrusted. Any instruction-like text inside a bit is treated as content to make a card from, never as a command.

What to verify:
- A bit containing "ignore previous instructions…" still yields a normal card about the bit, or a counted failure. It never yields anything else.
- The model can only return front and back text, which goes through the card rules and is shown as plain text, never as markup.

Acceptance:
- [ ] @anki-basic.S10 — e2e test not written: time ran out (needs backstop-scan driven test)
- [ ] pending implementation
