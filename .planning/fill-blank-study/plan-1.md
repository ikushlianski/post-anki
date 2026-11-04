## Goal

Render `fill_in_the_blank` review cards as cloze-style cards in the study session: show
the sentence prompt with `____` styled as a visible blank, then reveal the fill word as the
answer so the learner can grade themselves.

## Approach

No API change is needed. `fill_in_the_blank` variants are already included in the review
queue: `ANKI_VARIANT_KIND_PREFERENCE` ranks them second (after `basic`), and the
`eligibility` predicate has no kind filter, so they surface whenever a bit has no `basic`
variant. `card.kind`, `card.prompt` (sentence with `____`), and `card.answer` (fill word)
are all present in `ReviewCard` today. The grade endpoint is kind-agnostic.

Only the web presentation layer is missing: `AnkiReviewCard` renders all kinds the same way.
Adding a kind branch inside that component is the entire scope. No new module, boundary, or
data contract beyond `brief.md`.

## Steps

1. **`apps/web/src/knowledge-bit/anki-review-card.tsx`**
   - Import a helper (inline, no new file) that replaces `____` with a styled `[...]` span
     (bold or underlined, `data-testid="fill-blank-cloze"`).
   - When `card.kind === 'fill_in_the_blank'`, render the prompt through that helper instead
     of as raw text.
   - In the revealed state, wrap `card.answer` in a visually distinct element
     (`data-testid="fill-blank-answer"`) — same position as the existing answer paragraph,
     just with the fill word emphasised (`font-semibold` or `<strong>`).
   - All other kinds keep existing rendering unchanged.

2. **`apps/web/src/knowledge-bit/anki-review-card.test.tsx`** (new file)
   - Test: fill_in_the_blank card renders `[...]` in place of `____` before reveal.
   - Test: fill_in_the_blank card shows the answer word after reveal.
   - Test: `basic` card is unaffected (existing snapshot or equivalent).

## Tests

Both new behaviours get unit tests in the new `anki-review-card.test.tsx` co-located with
the component. Use `@testing-library/react`, reuse any existing mock shape for `ReviewCard`
found in the nearest `test-mocks` folder.

## Done when

- A `fill_in_the_blank` card in the review queue shows the cloze sentence with `____`
  replaced by a styled blank element.
- Clicking "Show answer" reveals the fill word in the answer slot.
- Grading (Again / Hard / Good / Easy) works unchanged (existing path).
- `basic` and `wh_question` cards render identically to today.
- Two new unit tests pass: blank rendering before reveal, answer word after reveal.
- `npx tsc --noEmit` and lint report zero new errors.

## Defaults chosen

- Replace `____` with `[...]` (not `_____` underline or an input field): matches standard
  cloze notation the learner already sees during card generation review.
- No `sentence` DB column exposed in the API response: `card.prompt` already contains the
  full cloze sentence; surfacing `sentence` would require changes in four files (shared
  schema, two repo files, interface) for marginal UX gain in this iteration.
- Inline replace helper (not a new utility file): single call site, under 5 lines, does not
  justify a shared module.

END-OF-REPORT
