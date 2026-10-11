# Source-first study items

One model call reads the whole pasted source (per 3000-character chunk for long sources) and returns items of the form statement, question, answer, kind (`basic`, `why` or `fill_blank`) and a verbatim quote. The items appear on the approval page when the call returns.

## Pipeline
- Writer: `knowledge-bit-source-items.agent.ts`, 1 to 8 items per chunk, at most 40 per source. The source is wrapped in `<source>` and treated as untrusted data.
- Validation: the quote must appear in the source after normalisation (case, whitespace, ё, quote marks). Items in the wrong language, with meta words, or with a malformed blank are dropped. If 0 items survive or at least half are dropped, the chunk is retried once; still 0 marks the source failed.
- Storage: each item becomes one pending bit with one variant (`why` as `wh_question`, `fill_blank` as `fill_in_the_blank`, `basic` as `basic`).
- Regenerate: replaces only the undecided suggestions of one source; see `knowledge-bit-ingestion-pipeline.md`.

## Hand checklist
Run `npm run models:prices` to compare price and structured-output support. Then paste the example source into each of the five models (Settings switcher) and tick each line.

- [ ] Language kept: items are in the source language, never translated.
- [ ] No meta words: no "the text", "the author", "the passage" or their Russian equivalents.
- [ ] No dangling pronouns: every statement and question names its referent.
- [ ] The question alone makes sense without the source.
- [ ] Why-items link two or more sentences of the source.
- [ ] The quote is verbatim from the source.
- [ ] Fill-blank items have exactly one blank, on the load-bearing term.
- [ ] At most 8 items per chunk.
- [ ] A source containing "ignore previous instructions" yields only claims from the text.
