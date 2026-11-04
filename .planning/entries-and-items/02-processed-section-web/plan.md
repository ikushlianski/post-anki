# Plan 02: Processed section on the approve page (todo items 2 and 7)

## Goal
A fully reviewed entry stays on the approve page with a Mark as processed button until the user decides, processed entries sit in a collapsed "Processed (N)" section with Reopen, and the sidebar badge counts only open pending items.

## Approach
Depends on feature 01 (`knowledge_sources.processed_at`, mark and reopen routes); starts after it lands. Contract per brief.md: processed_at is user-set only, no automatic transition.

Facts verified in code:
- Page: `KnowledgeBitReviewPanel` (apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx:48) renders one `KnowledgeBitReviewSourceGroup` per entry (:385); empty state when `sources.length === 0` (:381). File is already 416 lines, so new logic goes in new files.
- Removal: `removeBits` filters out any entry with zero bits (knowledge-bit-review-sources.ts:12-15); used by approve (panel.tsx:180), reject (:214) and bulk (knowledge-bit-review-bulk-approval.ts:58). `dropEmptySourcesExcept` (sources.ts:80) also drops empty entries after regeneration. `restoreBit` re-creates a missing group (:126).
- Payload: `listPendingKnowledgeBitsForReview` (apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:168) selects only `approvalState = "pending"` bits (:183) and returns `[]` early when none (:187). So today only entries with pending bits are listed. Controller limit 200 (knowledge-bit-approval.controller.ts:11). Web fetch: `getPendingKnowledgeBitsForReview` (knowledge-bit-review.api.ts:40) -> api-client.ts:505.
- Badge: `usePendingReviewCount` (apps/web/src/nav/sidebar.tsx:12) reloads on `PENDING_REVIEW_CHANGED_EVENT` and every 60s via `getPendingKnowledgeBitCountForNav` (knowledge-bit-review.api.ts:130); API `countPendingKnowledgeBits` counts `approvalState = "pending"` (knowledge-bit-bulk-approval.repo.ts:80-84), with no entry join.

Design (no new module or contract beyond brief.md):
- Shared type `PendingKnowledgeSourceForReview` (packages/shared/src/knowledge-bit.ts:85) gets optional `decidedCount?: number` (approved + rejected bits of the entry) and `processedAt?: string | null`. Fully reviewed and processed entries come with `bits: []`; their cards are not listed (lightest honest display).
- API: pending query also filters `isNull(knowledgeSources.processedAt)`; each listed entry gets `decidedCount`. New helper file adds (a) open entries with decidedCount > 0 and no pending bit, (b) processed entries (processedAt desc). Extraction grade lookup is shared by pending and added entries. `countPendingKnowledgeBits` joins entries and counts only `processed_at is null`.
- Web: client keeps fully reviewed entries (decision counts up `decidedCount`, undo counts it down). Panel splits `sources` into open (`!processedAt`) and processed. Fully reviewed header: source text, extraction grade and note, Regenerate, Compare models link, "N of N reviewed", primary "Mark as processed". Processed section: native `<details>` "Processed (N)", hidden when N = 0, each row a short text preview, "N reviewed", Reopen. Mark and reopen update local state, then call `notifyPendingReviewChanged()`.

## Steps
1. packages/shared/src/knowledge-bit.ts: add the two optional fields.
2. apps/api/src/knowledge-bit/knowledge-bit-approval-entries.repo.ts (new): `fetchExtractionGrades`, `countDecidedBySource`, `listFullyReviewedAndProcessedEntries` (cap 100 each).
3. knowledge-bit-approval.repo.ts: use the helper, drop the early `[]`, filter processed entries out of pending bits, append added entries.
4. apps/api/src/knowledge-bit/knowledge-bit-bulk-approval.repo.ts: join `knowledgeSources`, add `isNull(processedAt)` to the count.
5. apps/web/src/knowledge-bit/knowledge-bit-review-sources.ts: `removeBits` keeps the entry and adds the removed count to `decidedCount`; `restoreBit` subtracts; `dropEmptySourcesExcept` also keeps entries with `decidedCount > 0`; add `markProcessed`, `reopenSource`, `splitSources`, `isFullyReviewed`.
6. apps/web/src/curriculum/api-client.ts and knowledge-bit-review.api.ts: server functions `markKnowledgeSourceProcessedForReview`, `reopenKnowledgeSourceForReview` wrapping 01's routes (reuse 01's api-client names if it already added them).
7. apps/web/src/knowledge-bit/knowledge-bit-review-processing.ts (new): `useSourceProcessing({ setSources })` with claim guard, per-entry error text ("Couldn't mark as processed. Try again."), notify on success.
8. apps/web/src/knowledge-bit/knowledge-bit-review-reviewed-actions.tsx (new): count line and Mark button (`PRIMARY_BUTTON_CLASS`, 44px phone).
9. apps/web/src/knowledge-bit/knowledge-bit-review-processed-section.tsx (new): the details section and rows (`SECONDARY_BUTTON_CLASS` Reopen, summary `min-h-[44px] sm:min-h-8`).
10. knowledge-bit-review-source-group.tsx: show extraction grade when `bits.length > 0 || decidedCount > 0`; render reviewed-actions for fully reviewed open entries; new prop `processing`.
11. knowledge-bit-review-regenerate.tsx: when `undecidedCount` is 0 the confirm text reads "Generate a new set of suggestions from this source? Approved and rejected ones stay."
12. knowledge-bit-review-panel.tsx: wire the hook, render open groups then the Processed section; empty state only when no entries at all.
13. Storybook: mocks in apps/web/src/mocks/knowledge-bit-review.mock.ts (`fullyReviewedSource`, `processedSource`); stub functions in apps/web/.storybook/stubs/knowledge-bit-review.api.stub.ts; story file below.

## Tests
- sources.test.ts (extend): last bit removed keeps the entry with a higher `decidedCount`; undo restores into the same entry; markProcessed/reopen move an entry between the lists; empty regenerated entry with `decidedCount` 0 is still dropped.
- knowledge-bit-review-panel.processing.test.tsx (new, mock api as panel.test.tsx does): approving the last card leaves the header with "1 of 1 reviewed" and Mark as processed; Mark moves the entry into the collapsed "Processed (1)" and dispatches `PENDING_REVIEW_CHANGED_EVENT`; Reopen moves it back; failure keeps the entry and shows the error; Processed section absent at N = 0; Regenerate and Compare link present on a fully reviewed entry.
- Update panel.test.tsx:121-133 (it expects the whole source to vanish) to the new behavior; run the bulk, decision and regeneration panel tests.
- API integration (knowledge-bit-approval.repo.integration.test.ts): list includes fully reviewed and processed entries with counts and no cards; pending bits of a processed entry are not listed. Bulk repo integration test: count ignores pending bits of processed entries.
- Run `npx vitest run` for these files, then `npx tsc --noEmit` and lint.

## Storybook
apps/web/src/storybook/knowledge-bit-review/knowledge-bit-review-processed.stories.tsx, panel stories: `OpenWithPendingCards`, `FullyReviewedAwaitingDecision`, `ProcessedSectionExpanded` (details open via play function).

## Phone-layout check
scripts/phone-layout-check.mjs is not edited. Its measure includes `summary`, `button` and `a` (line 48), so the Processed summary, Mark and Reopen are 44px on phone and never overflow (use `break-words`, `min-w-0`). The Reject-then-Undo layer (lines 294-298) still passes because the entry stays and `restoreBit` re-inserts the card. Run it with `--seed` after the change.

## Done when
- Approving or rejecting the last pending card keeps the entry listed with Regenerate, Compare, grade and "N of N reviewed".
- Mark as processed moves it to the collapsed Processed (N) section without reload; Reopen moves it back.
- Badge reloads on mark and reopen and counts only pending bits of non-processed entries.
- Tests above pass; tsc and lint clean; phone-layout check passes; three Storybook states render.

## Defaults chosen
- No cards listed for fully reviewed entries: payload and UI stay light, grading is already stored.
- Processed entries show text preview, count and Reopen only: the review flow is finished.
- Badge excludes pending bits of processed entries: list and badge stay consistent; reopen shows them again.
- Lists capped at 100 per group: matches the existing 200-bit cap style.
- Server function names follow `...ForReview`; reuse 01's api-client names if present.
- New logic in new files: panel.tsx is over 300 lines.
- Mark button only on entries with no pending card and not regenerating.

## Footprint
Create: apps/api/src/knowledge-bit/knowledge-bit-approval-entries.repo.ts; apps/web/src/knowledge-bit/knowledge-bit-review-processing.ts; knowledge-bit-review-reviewed-actions.tsx; knowledge-bit-review-processed-section.tsx; knowledge-bit-review-panel.processing.test.tsx; apps/web/src/storybook/knowledge-bit-review/knowledge-bit-review-processed.stories.tsx.
Edit: packages/shared/src/knowledge-bit.ts; apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts (+ integration test); knowledge-bit-bulk-approval.repo.ts (+ integration test); apps/web/src/curriculum/api-client.ts; apps/web/src/knowledge-bit/knowledge-bit-review.api.ts, -sources.ts (+ test), -source-group.tsx, -regenerate.tsx, -panel.tsx, -panel.test.tsx; apps/web/src/mocks/knowledge-bit-review.mock.ts; apps/web/.storybook/stubs/knowledge-bit-review.api.stub.ts.
Overlap with feature 05 (Add new KI): knowledge-bit-review-source-group.tsx (button must show on open, fully reviewed entries), -panel.tsx (new draft handlers), -sources.ts (creating a card must clear fully reviewed state), packages/shared/src/knowledge-bit.ts, mocks, stub, api.ts, api-client.ts. Land 02 first.
