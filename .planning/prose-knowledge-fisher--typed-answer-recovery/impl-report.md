# Impl report: typed answer survives failures

## Files changed
- apps/web/src/routes/knowledge.answer.tsx (222 lines)
- apps/web/src/routes/-knowledge.answer.test.tsx (the existing test file; the leading dash is the repo's route-ignore convention)

## Behavior
- Evidence in report section 7 checked against the code before editing; line numbers matched.
- Load failure: "Couldn't load your questions." with a Retry button that refetches; the false "Nothing to answer right now" no longer shows on error.
- Grading failure: plain sentence, no raw code. "Try again" returns to the form with the draft intact. "Skip this question" (the old Next) clears the draft and moves on.
- Loading text now also shows while the queue refetches after the last question in a batch.

## Tests
- `npx vitest run src/routes/-knowledge.answer.test.tsx` (from apps/web): 8 passed, 0 failed (4 new).

## tsc
- `npx tsc --noEmit` in apps/web: no output, zero errors.

## Defaults
- Try again returns the learner to the editable form (does not auto-resubmit), so they can edit before resubmitting.
- Test added to the existing dash-prefixed test file rather than a new knowledge.answer.test.tsx.
- Grading API untouched; no file split needed.

## Undone
- Nothing.

## Citation
apps/web/src/routes/knowledge.answer.tsx:201 (grading-failure block with Try again / Skip this question; draft is only cleared in next()).

END-OF-REPORT
