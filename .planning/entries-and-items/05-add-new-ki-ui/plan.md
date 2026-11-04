# Plan 05: Add new KI button and draft card (todos 5 and 6)

## Goal
An "Add new KI" button on open and fully reviewed entries opens a browser-only draft card (Front, Back, Example) that is saved to the server only once Front and Back both have text, then behaves as a pending card without grades.

## Approach
Depends on 02 (processed section, landed) and 04 (`POST /knowledge-sources/:id/items`, landed, 201 with the pending-review item, 409 for processed or regenerating). No new server contract; the web only adds a client for that route. Facts verified in code:
- A fully reviewed entry is `bits.length === 0 && decidedCount > 0 && !processedAt` (`knowledge-bit-review-sources.ts` `isFullyReviewed`). Adding the created bit to the entry makes it open again with no extra state, and the Mark as processed block disappears.
- Processed entries render only in `KnowledgeBitReviewProcessedSection`, so the button lives in the open-entry group only (reopen first; server 409 is the backstop).
- Autosave: `useAutoSave` (`knowledge-bit-review-autosave.ts`) reads textareas from the DOM every 250 ms, saves after 800 ms idle, and only when `isValid`. Dictation tools that set values without input events work. Edits go through `saveVariant` (supersedes variant, returns new id) and `saveBit` with the body unchanged (background-only, safe: `updateKnowledgeBitBody` skips the stamp reset when the body is equal).
- `KnowledgeBitReviewItem` already hides grades for `origin === 'manual'`; regeneration keeps manual bits (`markSourceRegenerating`, `dropEmptySourcesExcept`, API `ne(origin, "manual")`).

Design:
- New `KnowledgeBitReviewDraftCard`: uncontrolled textareas via the existing `ReviewField` (Front strong, Back, Example), one `useAutoSave` over all three. Valid = Front and Back non-empty after trim and within the shared caps (300/600/300). First valid save = create; later saves diff against the last saved values and call `saveVariant` (Front/Back) and `saveBit(bit.body, example|null)` (Example). The component stays mounted through creation, so nothing remounts and dictated or typed text in Example is never lost. After creation it shows Approve and Reject for the real bit and no grade block. Before creation it shows Cancel (discard, no server call).
- New hook `useManualDrafts` owns the draft list per entry (`{id, sourceId, bitId|null}`), create call, error text and de-duplication (a second click while an empty draft exists focuses it). Created bit is appended to the entry, added to `knownBitIds` (polling never re-adds it), `origin: 'manual'` forced, badge notified. A draft entry is dropped once its bit leaves `sources` (approve or reject).
- Source group renders `source.bits` minus draft-owned bits, then the draft cards, inside the existing `ul`. Button hidden while regeneration is starting or running (same rule as Mark as processed).

## Steps
1. `apps/web/src/curriculum/api-client.ts`: `createKnowledgeSourceItem(sourceId, input)` POST `/knowledge-sources/${sourceId}/items`, returns `be.PendingKnowledgeBitForReview`.
2. `apps/web/src/knowledge-bit/knowledge-bit-review.api.ts`: `createManualKnowledgeItemForReview` server function (zod: `{ sourceId }` and `createManualKnowledgeItemInput`).
3. `knowledge-bit-review-sources.ts`: `addManualBit(sources, sourceId, bit)` (append, force origin manual, no-op if id exists).
4. `knowledge-bit-review-card-fields.tsx`: optional `maxLength` prop on `ReviewField`; export `StatusLine` reuse (already exported).
5. New `knowledge-bit-review-manual-drafts.ts`: the hook (step design above); error text "Couldn't add the card. Try again."
6. New `knowledge-bit-review-draft-card.tsx` (under 150 lines): fields, autosave, over-limit hint, Cancel or Approve/Reject. Move the Approve/Reject row out of `knowledge-bit-review-item.tsx` into small `knowledge-bit-review-item-actions.tsx` and use it in both.
7. New `knowledge-bit-review-draft-list.tsx`: renders the entry's draft cards and the "Add new KI" button (`SECONDARY_BUTTON_CLASS`, testid `knowledge-bit-review-add-item-<sourceId>`).
8. `knowledge-bit-review-source-group.tsx`: one new prop `manualItems` (hook controls); skip draft-owned bits; render the list and button.
9. `knowledge-bit-review-panel.tsx`: call the hook, pass `manualItems` (about 8 lines; file is already over 300 lines, not refactored here).
10. Storybook: `apps/web/src/mocks/knowledge-bit-review.mock.ts` (`manualBit`), `apps/web/.storybook/stubs/knowledge-bit-review.api.stub.ts` (`createManualKnowledgeItemForReview` echoing the input as a manual bit), new story file below.

## Tests
- `knowledge-bit-review-sources.test.ts`: `addManualBit` appends, keeps `decidedCount`, turns a fully reviewed entry open (`isFullyReviewed` false), ignores unknown entry and duplicate id.
- `knowledge-bit-review-draft-card.test.tsx` (fake timers): empty or Front-only draft never calls create; Front and Back filled calls create once with trimmed values and Example; Example typed later saves via `saveBit`, Front edit via `saveVariant`, create not repeated; over-cap text is not sent; Cancel calls nothing; no grade controls; textarea nodes are the same elements after creation.
- `knowledge-bit-review-panel.manual.test.tsx` (mock api like `panel.test.tsx`): button on open and fully reviewed entries, absent in the Processed section and while regenerating; second click does not add a second empty draft; creating on a fully reviewed entry hides "N of N reviewed" and Mark as processed, shows the card, fires `PENDING_REVIEW_CHANGED_EVENT`; failure keeps typed text and shows the error; approving the new card returns the entry to fully reviewed; a poll does not duplicate the card.
- `api-client.test.ts`: POST path and body of `createKnowledgeSourceItem`.
- Run `npx vitest run` on these files plus panel, decision and regeneration tests, then `npx tsc --noEmit` and lint.

## Storybook
`apps/web/src/storybook/knowledge-bit-review/knowledge-bit-review-add-item.stories.tsx`, panel stories: `AddButtonOnOpenEntry`, `AddButtonOnFullyReviewedEntry`, `DraftFilled` (play types Front and Back, then the stub create succeeds and the card shows Approve and Reject without grades).

## Phone layout
`scripts/phone-layout-check.mjs` is not edited and never run with `--use-dev-app`. Run it with `--seed` against the isolated stack (`npm run e2e:stack:up`, port 5550) after the change. The button, Cancel, Approve and Reject use the 44px button classes; textareas keep `min-h-[44px]` from `BORDERLESS_FIELD_CLASS`; draft card uses `min-w-0` and `break-words`.

## Done when
- Button shows on open and fully reviewed entries, never on processed ones.
- Click opens Front, Back and Example textareas; nothing reaches the server while Front or Back is empty; Cancel discards without a request.
- The first moment both have text (after the 800 ms idle) creates one pending manual item; later edits autosave through the existing edit routes; no remount, focus and unsaved Example text survive creation.
- Creating on a fully reviewed entry reopens it in the list at once and updates the badge; no grade controls on the card; regeneration keeps it.
- Tests, tsc, lint and phone-layout check pass; three stories render.

## Defaults chosen
- Save trigger: first valid autosave tick, no explicit Save button; matches existing card autosave and dictation.
- Cancel never asks to confirm: draft is browser-only and cheap to retype.
- One empty draft per entry; many drafts allowed once saved.
- New card goes at the end of the entry's cards, outside bulk "Approve all" order changes; it still counts for bulk and keyboard like any pending card.
- Caps from the shared constants, hint on overflow (programmatic dictation bypasses `maxLength`).
- Generic error text for any create failure (including 409): the user can retry or reload.
- No beforeunload warning for an unsaved partial draft.

## Footprint
Create: `apps/web/src/knowledge-bit/knowledge-bit-review-manual-drafts.ts`, `-draft-card.tsx`, `-draft-card.test.tsx`, `-draft-list.tsx`, `-item-actions.tsx`, `-panel.manual.test.tsx`; `apps/web/src/storybook/knowledge-bit-review/knowledge-bit-review-add-item.stories.tsx`.
Edit: `apps/web/src/curriculum/api-client.ts` (+ test), `knowledge-bit-review.api.ts`, `-sources.ts` (+ test), `-card-fields.tsx`, `-item.tsx`, `-source-group.tsx`, `-panel.tsx`, `apps/web/src/mocks/knowledge-bit-review.mock.ts`, `apps/web/.storybook/stubs/knowledge-bit-review.api.stub.ts`.
