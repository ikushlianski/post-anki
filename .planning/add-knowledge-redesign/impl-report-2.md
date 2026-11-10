# Implementation report 2

Diff command: `git diff -- apps/web/src/knowledge-source apps/web/src/routes/-add-knowledge.test.tsx apps/web/src/ui/searchable-select.tsx packages/shared/src/knowledge-item-model.ts packages/shared/src/knowledge-item-model.test.ts` (nothing staged or committed, per instructions; the foreign untracked use-knowledge-subject-choice.ts was left alone).

## Checks
- apps/web `npx tsc --noEmit`: clean
- apps/web `npx vitest run`: 210 files, 1415 tests passed
- packages/shared `npx vitest run`: all passed (incl. new cheapest-model tests)
- No lint script exists.

## Changes
- Subject picker, "Adding to:" line and More options moved above the paste box; Model sits just above the submit row.
- Shared `cheapestKnowledgeItemModelId(now?)` (lowest in+out price, non-expired, first in list wins ties; currently GPT-OSS 120B) with 2 tests.
- Form: unchosen model no longer blocks submit; sends chosen/suggested model, else cheapest. Hint reads "Not chosen: the cheapest model (<label>) will be used." (testid knowledge-model-hint). Extraction model select component untouched.
- First block autofocuses on mount (`focusOnMount` prop, ref + effect); no paste/input handlers swallow events and the field is not readOnly while idle (tested).
- More options: toggle is not rendered when forced open by hint or allow-parents.
- Over-50,000 computed once on trimmed text in the form and passed to the block field (`trimmedLength`, `overLimit`); alert, count and submit agree; whitespace-padded test added.
- Focus ring: textarea, url input and searchable-select use `focus-visible:outline-2 focus-visible:outline-neutral-700`, no `outline-none`.

## Defaults
- Cheapest fallback test mutates the model table's expiresOn temporarily to prove expired models are skipped.
- Focus is a one-time mount focus; it is not restored after a successful submit.

END-OF-REPORT
