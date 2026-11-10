## Implementation report — fill-in-the-blank cloze card rendering

### Files changed

- `apps/web/src/knowledge-bit/anki-review-card.tsx` — added `renderFillBlankPrompt` inline helper; when `card.kind === 'fill_in_the_blank'` the prompt is rendered through that helper (replaces `____` with a bold `<span data-testid="fill-blank-cloze">[...]</span>`); in the revealed state `card.answer` is wrapped in `<strong data-testid="fill-blank-answer">`. All other kinds unchanged.
- `apps/web/src/knowledge-bit/anki-review-card.test.tsx` (new) — 3 tests covering blank rendering before reveal, answer display after reveal, and basic card unaffected.

### Check results

- `npx tsc --noEmit --project apps/web/tsconfig.json` — zero errors in our files (pre-existing errors in unrelated files remain unchanged).
- No lint config found in the repo (`eslint` absent from `apps/web`).
- `npx vitest run apps/web/src/knowledge-bit/anki-review-card.test.tsx` — 3/3 tests passed.

### Diff command

```
git diff HEAD apps/web/src/knowledge-bit/anki-review-card.tsx
```

### Defaults chosen

- Used `// @vitest-environment jsdom` directive (pattern from nearest existing test files) rather than relying on the global vitest config, which was not picking up jsdom at file level.
- Used `.textContent` property access instead of `toHaveTextContent` because `@testing-library/jest-dom` is not installed/typed in this workspace.
- Added `afterEach(cleanup)` following the pattern in `knowledge-bit-chat-panel.test.tsx` to prevent DOM leakage between tests.

END-OF-REPORT
