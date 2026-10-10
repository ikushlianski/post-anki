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
