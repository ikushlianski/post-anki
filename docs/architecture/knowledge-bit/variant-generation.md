---
type: architecture
domain: knowledge-bit
component: variant-generation
state: shipped
updated: 2026-10-10
---
# Knowledge-bit variant generation

## Passes

Each bit gets up to three cards, one per pass: why-question (`wh_question`), fill-in-the-blank (`fill_in_the_blank`) and front/back (`basic`). Each pass has its own cheap-tier agent and its own prompt, and writes into the question-variant table under its own kind. The basic pass writes a short recall question on the front and the plain fact on the back, checked by a pure rule (non-empty, front at most 300 characters, back at most 600, sides not identical, answer not contained in the front).

## Claim and retry markers

Every pass keeps five markers on the bit: generated-at, failed-at, attempt count, claimed-at and claim token. A run claims a bit with an atomic conditional update before calling the model. The card insert and the generated marker are written in one transaction, and a lost claim throws, which rolls the insert back. A failure counts one attempt, and a bit is left alone after three. A claim older than ten minutes can be taken over. Rejected bits are skipped. Editing a pending bit's text clears all markers of all passes.

## Triggers

- After a paste, the in-process pipeline kick runs detect, why-question, fill-in-the-blank, then basic. A failing pass is logged and does not stop the next.
- Each pass has a scan endpoint (`POST /knowledge-bits/<pass>-generation-scan`) and a 5-minute Cloud Scheduler job defined in `infra/index.ts`, both behind the shared secret. Each run handles at most 50 bits.

## Read side

Anki review prefers basic, then fill-in-the-blank, then why-question, one card per bit. Typed mode serves only why-question and fill-in-the-blank cards. See `anki-review.md`.

## Cloze notes

A business-subject lesson whose sentence holds 2 to 5 independent key terms is written as one note with `{{c1::term}}` / `{{c1::term::hint}}` markers. The source-items insert expands the note into one `cloze` variant per distinct number: `order` is the number, `sentence` keeps the note, `prompt` is the sentence with that number's gap shown as `____` (hint as `(hint: ...)`) and the other gaps filled in, `answer` is the hidden text (repeats of one number joined with ` / `). The bit body is the marker-free sentence. Cloze bits are stamped as already generated, so the wh, fill-in-the-blank and basic passes skip them. Editing a cloze card in review edits the whole note: unchanged numbers keep their variant, changed numbers get a replacement in the same slot, removed numbers are superseded, added numbers become new variants. Cloze variants share the bit's schedule and rotate through the queue like other variants; typed-answer mode refuses them.

## Ordered lists

A business-subject lesson whose text states a process of 3 to 8 steps in a fixed order is written as `ordered_list`: a title plus the steps. Every step must appear in the source chunk; duplicate steps, fewer than 3, more than 8, steps over 120 characters and text containing `____` are refused. The source-items insert expands the list into `list_step` (order = position, "In <title>, what is step n?"), `list_next` (order = position, "after <step n> the next step is ____", answer = the following step) and one `list_overview` (order 0, count then the numbered steps). `sentence` keeps the canonical text (title on line one, one step per line); the bit body is `<title>: <steps joined by "; ">`. List bits are stamped as already generated, so the wh, fill-in-the-blank and basic passes skip them, and a plain body edit of a bit with list cards is refused. Editing one list card in review edits the whole list through `PATCH question-variants/:id {list}`: cards are keyed by position, so unchanged slots keep their variant, changed slots get a replacement, removed positions are superseded and added positions become new variants. List variants share the bit's schedule and rotate through the queue like other variants; typed-answer mode refuses them.
