# Review 1 — failed-extraction indicator

state: needs-changes
reviewedBy: claude-sonnet-4-6 (effort: high, mode: light Complex plan review)

## Quality gate results

- npx tsc --noEmit (packages/shared, apps/api, apps/web): clean
- npx vitest run (6 new unit test files, 38 tests): all pass
- Lint: not configured

## Findings (worst first)

### F1 — Single-item delete does not return focus (plan contract violation)

After a successful one-item delete the item is removed from the DOM. `FailedExtractionItem` has no `ref` for the toggle or the next item and makes no `focus()` call in the `onConfirm` path. Keyboard users are stranded at `document.body`.

The plan contract states: "focus returns to the toggle (or the next item) afterwards." The indicator-level `handleDeleteAll` does call `toggleRef.current?.focus()`, so the pattern is established; it was simply not carried through to the per-item path.

File: `apps/web/src/knowledge-source/failed-extraction-item.tsx`
Fix: pass a `focusRef` (or a callback) into `FailedExtractionItem` that the confirm's `onConfirm` handler calls after `onDelete`. In `FailedExtractionsIndicator`, the `toggleRef` is the natural target when no next item exists.

### F2 — `retryAll` 10-item cap is not unit-tested

`use-failed-extractions.ts:100` slices `retryable` to 10, but no test in `failed-extractions-indicator.test.tsx` or any co-located file verifies this cap fires. The plan lists "Retry all caps at 10" explicitly under Tests.

File: `apps/web/src/knowledge-source/failed-extractions-indicator.test.tsx`
Fix: add one test that renders 11 retryable items and asserts `regenerateKnowledgeSourceForReview` is called exactly 10 times.

### F3 — `modelId as never` type cast in retrySource

`use-failed-extractions.ts:72` uses `modelId as never` to satisfy the server-fn argument shape. This masks a real type mismatch. The cast does not violate the `no any` rule literally, but it suppresses the same kind of type-safety the rule is meant to protect. TypeScript reports no error only because `never` is assignable to every type.

File: `apps/web/src/knowledge-source/use-failed-extractions.ts:72`
Fix: declare a proper input type for `regenerateKnowledgeSourceForReview` that accepts `modelId?: string` and remove the cast.

## Items verified clean

- `toPublicFailureReason` maps every known code: no_valid_items, wrong_language, source_empty, source_too_long, source_chunk_missing, knowledge_source_reclaimed, workflow_* prefix, durable:* marker, null, and free-text provider messages. All fall to safe public reasons; raw text never reaches the API response (only the truncated `preview`, which is the user's own pasted text as specified by the plan).
- Deletion transaction uses `.for("update")`, checks `isFailedOrStuck`, guards approved/manual bits with `has_cards`, deletes variants/attempts/tag-assignments/bits/source in one transaction, keeps `knowledge_bit_feedback` and `knowledge_source_extraction_grade` rows intact.
- Stuck retry WHERE extends `claimSourceForRegeneration` with `pending|processing AND updatedAt < now - durableStaleMs()`. Fresh processing rows still return `already_running`.
- Indicator: hidden when `items.length === 0`, collapsed by default (`useState(false)`), `aria-expanded={expanded}`, `aria-controls` set.
- `source_empty` and `source_too_long` show no Retry (`isRetryableReason` returns false; item test confirms no button).
- Delete confirm states count, Escape cancels, Enter on focused Delete button confirms, indicator-level focus returns to toggle after Delete all.
- Both route tests (`-add-knowledge.test.tsx`, `-knowledge-bit-review.test.tsx`) mock `../knowledge-source/failed-extractions.api`.
- No `any` (only one `as never` cast, noted above as F3).
- All new files are under 300 lines.
- Routes placed before `/:id/` regexes in `router-table.ts`; no collision risk.
- Authorization flows through the global `authorized()` check in `api-server.ts`; no bypass.

## Blocking issues

2 — F1 (focus return for single-item delete) and F2 (missing cap test) are both explicit plan-contract items. F3 is non-blocking but should be fixed alongside F1/F2.

END-OF-REPORT

## Fix-up note

All three findings addressed in a single pass.

F1: Added `onDeleteFocusTarget?: () => HTMLElement | null | undefined` to `FailedExtractionItemProps`; the `onConfirm` handler in the delete-confirm path now calls `onDeleteFocusTarget?.()?.focus()` after `onDelete`. `FailedExtractionsIndicator` passes `() => toggleRef.current` as that callback.

F2: Added one test ("should call regenerateKnowledgeSourceForReview exactly 10 times when retrying 11 retryable items") to `failed-extractions-indicator.test.tsx`. The mock returns `{ status: 'running', supersededCount: 0 }`; `waitFor` asserts the call count reaches 10 and no more.

F3: Removed `modelId as never`; since `regenerateKnowledgeSourceInput` declares `modelId` as `knowledgeItemModelIdSchema.optional()`, passing `modelId` (which is `string | undefined`) directly is type-correct with no cast.

Quality gates: `npx tsc --noEmit` in apps/web — two pre-existing errors in `knowledge-overview-screen.tsx` (unrelated); zero errors from changed files. `npx vitest run apps/web/src/knowledge-source/` — 7 files, 54 tests, all pass.

END-OF-REPORT
