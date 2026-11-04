# Plan 1: guided Add knowledge form + per-block failure reasons

## Goal
Reshape Add knowledge into paste box, one primary submit, compact Subject/Model row, "More options" disclosure, and show a reason next to every block that failed to add.

## Approach
No new boundary. All changes are inside `apps/web/src/knowledge-source/` (UI only); `knowledge-source.api.ts`, the API, and `routes/add-knowledge.tsx` are untouched.
`add-knowledge-form.tsx` (353 lines) becomes a ~150-line composer holding state; markup and logic move to entity-folder files.
Error facts: the server fns re-throw `ApiError` from `request()` in `apps/web/src/curriculum/api-client.ts:119`, whose message is only `api POST /knowledge-sources -> <status>`. Zod validator failures arrive as JSON text. Assumption: `status`/`code` do not survive the server-fn boundary, so only `message` is relied on. The reason is derived by parsing the trailing status from that message. The raw message is never shown.
A batched text call (`createKnowledgeSources`) fails or succeeds as one unit, so all text blocks in it get the same reason.

## Steps
1. `describe-add-failure.ts` (new): `describeAddFailure(error: unknown, blockType: 'text'|'url'): string`. Parse `-> (\d{3})`.
   - 400/422: text gives "The server could not accept this text. Check it and try again."; url gives "The link could not be read. Check it is a public page."
   - 401/403: "You are not allowed to add knowledge. Sign in again."
   - 413: "This is too large to add. Split it into smaller blocks."
   - 429: "Too many requests. Wait a minute and try again."
   - 5xx: "The server had a problem. Try again shortly."
   - Zod/invalid-url message: "That does not look like a valid link. Start it with https://".
   - Fetch/network failure (TypeError, "fetch failed"): "Could not reach the server. Check your connection."
   - Anything else: "Something went wrong. Try again."
2. `submit-knowledge-blocks.ts` (new): move `Block` types and job-building out of the form. Export `submitKnowledgeBlocks(blocks, { subjectId, modelId })` returning `{ createdCount, failures: Map<number, string> }` (index to reason). Keep the existing grouping: 1 text uses `createKnowledgeSource`, >1 texts use `createKnowledgeSources`, each url uses `createKnowledgeSourceFromUrl`, all via `Promise.allSettled`. Also hold `Block` (`{type, value, error?: string}`), `emptyBlock`, `failedBlocksMessage`.
3. `knowledge-block-field.tsx` (new): one block.
   - Segmented group `role="group"`: Paste text / Add link. Keep the `aria-pressed` buttons and testids `knowledge-block-type-{text|url}-{i}`. Quiet style: selected is `bg-neutral-200`, unselected has no border, both `min-h-[44px] sm:min-h-0`.
   - Textarea: `rows={8}`, `resize-y` (was `resize-none`). Same testid and aria-labels.
   - Character count `knowledge-block-count-{i}` ("41,000 / 50,000") shown once length >= 80% of `KNOWLEDGE_SOURCE_TEXT_MAX_CHARS`.
   - Keep `knowledge-block-too-long-{i}` (role=alert).
   - New `knowledge-block-error-{i}`: `role="alert"`, red, directly under the input, shows `block.error`.
   - Remove button for index > 0 only, 44px target.
4. `knowledge-more-options.tsx` (new): a button with `aria-expanded` toggles a region (`hidden` attribute, content stays mounted). It holds the `knowledge-allow-parents` checkbox and the `knowledge-parent-hint`. It is forced open while `parentHintName !== null || allowParents`, so the required "pick a sub-subject" hint is never hidden.
5. `knowledge-add-success.tsx` (new): the `role="status"` container, always mounted. When there is a message it holds the `knowledge-success-message` p (exact text unchanged) plus the `knowledge-success-review-link` as a button-style link (`bg-neutral-900 text-white min-h-[44px]`) and the quiet `knowledge-success-back-link`.
6. `add-knowledge-form.tsx`: rewrite layout in this order.
   - Blocks (each a `KnowledgeBlockField`).
   - Action row: primary `knowledge-submit-button` (full width on mobile, 44px), then quiet text-style `knowledge-add-block-button` "+ Add another block".
   - Success component.
   - Summary `knowledge-error-message` (text unchanged, drop reliance on it for the reason, no role to avoid double announcement).
   - Row `grid sm:grid-cols-2`: Subject combobox and Model select. `knowledge-model-hint` ("Choose a model to continue.") moves into the Model column right under the select, with `aria-describedby` from the submit button.
   - Small `knowledge-adding-to-label`.
   - `KnowledgeMoreOptions`.
   On submit, call `submitKnowledgeBlocks`, then keep only failed blocks with `error` set from `failures`. Editing a block clears its `error`.

## Tests
- `describe-add-failure.test.ts` (new, co-located): 400 text vs url wording, 401, 413, 429, 5xx, network error, zod-invalid-url, and unknown input. Each asserts the raw `api POST ...` string is never in the output.
- `submit-knowledge-blocks.test.ts` (new): mocks `./knowledge-source.api`. Checks grouping of calls, the failed index maps to a reason, a failed text batch marks all its indices, and a partial success counts correctly.
- `knowledge-block-field.test.tsx` (new): count hidden below 80% and shown near the limit, the error alert renders under the block with role alert, the first block has no Remove, and tab toggling calls the handler.
- `knowledge-more-options.test.tsx` (new): collapsed by default, toggle expands, forced open when the hint exists.
- `apps/web/src/routes/-add-knowledge.test.tsx` (append one describe, edit nothing existing). Covers:
  - a failed url block shows an alert with the reason inside the block, and the successful block's text is cleared
  - editing a failed block clears its error
  - the success area has role status and the review link is a link
  - the model hint is in the same container as the model select
- The existing 48 tests must pass unchanged, including the `knowledge-adding-to-label` assertions and the `knowledge-allow-parents` clicks (the content stays mounted when collapsed).

## Done when
- Paste box, the Add knowledge button, then Subject/Model row are visible in that order; the parent checkbox sits behind "More options".
- A failed block shows a specific reason with `role="alert"` next to it and keeps its text; the 50,000 limit message still works.
- The success message is in `role="status"` with a button-style review link.
- No file under `apps/web/src/knowledge-source/` exceeds 300 lines (form ~150).
- `npx vitest run apps/web/src/routes/-add-knowledge.test.tsx apps/web/src/knowledge-source`, `npx tsc --noEmit` and lint are clean. No `any`.

## Defaults chosen
- Keep "Adding to:" as a small line: 4 existing tests assert its text.
- More options is a button plus a hidden region, not `<details>`: it is controllable and forced open for the parent hint.
- Reason text is mapped from the status in the message, not shown raw: the raw string is technical and leaks API paths.
- Keep the summary `knowledge-error-message` and its exact text: existing tests assert it.
- Per-block `error` is stored on the `Block` so it survives the re-indexing after successes are removed.
- Submit stays directly under the block list, with "+ Add another block" beside it: this keeps the primary action under the paste box when there are several blocks.
- Count threshold 80%: it stays quiet for normal pastes.
- Route file and subtitle unchanged: a route test asserts that text.
- New tests for new units go in co-located files; only integration cases are appended to the 945-line route test.

END-OF-REPORT
