# Implementation report: say why a paste or link was refused

## Files changed
- packages/shared/src/knowledge-source-refusal.ts (new, exported from index.ts): code-to-sentence contract, 50,000 limit, truncation notice, helpers to carry a code across the server-function boundary.
- packages/shared/src/knowledge-source-refusal.test.ts (new)
- apps/api/src/knowledge-source/knowledge-source.controller.ts: plain messages for fetch_failed, empty_content, subject_not_found; too-long text keeps `invalid_input` and gains `reason: "text_too_long"` plus a plain message; URL imports return `truncated` (boolean).
- apps/api/src/knowledge-source/knowledge-source.controller.refusals.test.ts (new)
- apps/web/src/knowledge-source/add-knowledge-form.tsx: per-block reason shown under the failing block; success line adds the truncation notice.
- apps/web/src/knowledge-source/submit-knowledge-blocks.ts (new): submit logic moved out of the form (keeps it under 300 lines), maps rejections to sentences, pre-checks text over 50,000 characters.
- apps/web/src/knowledge-source/knowledge-source.api.ts: server functions re-throw known codes as `refusal:<code>` so the code survives to the browser.
- apps/web/src/curriculum/api-client.ts: `KnowledgeSource.truncated?` field only.
- apps/web/src/knowledge-source/add-knowledge-form.refusals.test.tsx (new)

## Behavior
- A failed link or text shows its sentence directly under that block: "That page could not be opened.", "That page has no readable text.", "The chosen subject no longer exists. Pick another subject.", "This text is longer than 50,000 characters. Split it into smaller blocks."
- Over-long text is caught in the browser at its own block (other blocks still go through); the server also answers with a plain message and `reason` for other clients.
- Importing a page longer than 50,000 characters succeeds and says "Only the first 50,000 characters of the page were read."
- Unknown failures keep the old generic "Block N could not be added. Try again." with no reason line.
- Error codes are unchanged (fetch_failed, empty_content, subject_not_found, invalid_input); only messages and fields were added. The extension reads only the HTTP status (apps/extension/src/capture/send-capture.ts), so it is unaffected. No files under apps/web/src/nav or anki-review-session were touched.

## Evidence check
- Confirmed: reason discarded in Promise.allSettled, server codes, silent truncateText, ApiError keeping the code.
- Partly wrong: the "Blocks 1, 2" numbers do match the on-screen positions, because failed blocks are filtered and renumbered on screen (existing tests assert this). The real gap was that the reason was missing, so I kept the numbering and attached each reason to the block as displayed after the filter.
- Server fns: ApiError instances are not trusted to survive serialization, hence the `refusal:<code>` re-throw (assumption, not tested against the running app).

## Tests
- `cd packages/shared && npx vitest run src/knowledge-source-refusal.test.ts`: 3 passed, 0 failed.
- `cd apps/api && npx vitest run src/knowledge-source/knowledge-source.controller`: 72 passed, 0 failed (7 files).
- `cd apps/web && npx vitest run src/knowledge-source src/routes/-add-knowledge.test.tsx`: 44 passed, 0 failed (2 files).
- `npx tsc --noEmit` in packages/shared, apps/api, apps/web: no errors.

## Defaults and undone
- Default: the too-long case keeps code `invalid_input` (adds `reason`) rather than a new code, to honor "don't change codes". The web maps it via a client-side length check, not the server `reason`.
- Not verified in a running browser; nothing staged or committed; no migrations.
- Not done: a blank succeeded block is not kept in place (existing filter behavior retained).

## Citation
apps/web/src/knowledge-source/submit-knowledge-blocks.ts:109 (rejection code mapped to its sentence, stored per block index); rendered at apps/web/src/knowledge-source/add-knowledge-form.tsx under each block via `knowledge-block-error-<index>`.

END-OF-REPORT
