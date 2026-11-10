# Impl report 1: quote tolerance

## Root cause
- Confirmed: log lines show quote_not_in_source drops (and quote_length once) followed by no_valid_items for the failing run. The log does not contain the source text or the model's quotes, so the exact mismatch is NOT confirmed.
- Already tolerant before: case, e-diaeresis, quote marks, whitespace runs, NFKC.
- Assumed gaps: dash variants (en/em/minus/non-breaking hyphen), quotes wrapped in leading/trailing punctuation or ellipsis. Paraphrasing cannot be fixed by tolerance and stays rejected.

## Changes (apps/api/src/knowledge-bit)
- knowledge-bit-source-item-validation.ts: normalize unicode dashes to "-"; isQuoteInSource strips non-letter/digit chars at the quote edges. Length checks and containment match unchanged (no fuzzy matching).
- detect-knowledge-bits.orchestrator.ts: when the first attempt had quote_not_in_source drops, the retry gets VERBATIM_QUOTE_RETRY_NOTE appended via the existing feedbackBlock option (avoids touching the agent file).
- Tests added in both co-located test files (edge punctuation, dash variant, still-rejected invented quote, retry note).

## Checks
- npx tsc --noEmit: clean. vitest on both files: 57 passed. eslint not runnable (repo has no eslint.config for this package; v9 error).
- Not staged, per instruction.

END-OF-REPORT
