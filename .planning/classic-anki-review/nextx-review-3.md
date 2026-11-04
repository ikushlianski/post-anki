# nextx review 3: source exhausted -> processed, and items added by hand

Scope: working tree on branch learn-from-doc-site, read-only. Contract: the two TODO.md lines, `.planning/classic-anki-review/source-exhaust-and-manual-items-plan.md`, `.planning/entries-and-items/brief.md` and its plans 01, 02, 04, 05.
Severity gate: Critical/High only. One Medium item is recorded at the end because it contradicts a claim in the plan.

## Verdict per todo

(a) "Move a source to processed when the user marks it exhausted": DONE
(b) "Add new knowledge items by hand to an existing source": DONE

Critical findings: none. High findings: none.

## (a) Mark processed: evidence

- UI entry point: "Mark as processed" button on a fully reviewed open source, `apps/web/src/knowledge-bit/knowledge-bit-review-reviewed-actions.tsx:27-36`, rendered from `knowledge-bit-review-source-group.tsx` (`isFullyReviewed(source)` block). Processed section with Reopen: `knowledge-bit-review-processed-section.tsx:29-75`. Wording is "processed", the todo says "exhausted" (product call 2 below).
- Client path: `knowledge-bit-review-processing.ts:38-63` calls `markKnowledgeSourceProcessedForReview`, moves the entry locally, notifies the sidebar badge. If cards appeared while the call was in flight it reopens on the server (lines 48-51) instead of hiding pending cards. Server fn and api-client: `knowledge-bit-review.api.ts:160-170`, `apps/web/src/curriculum/api-client.ts:539-552`.
- API: `POST` and `DELETE /knowledge-sources/:id/processed` (REST sub-resource, `apps/api/src/router-table.ts:189-200`, `api-server.ts:513-516`). Controller `apps/api/src/knowledge-source/knowledge-source-processed.controller.ts:7-38`: id pattern check (400 `invalid_id`), 404 `not_found`, 409 `entry_processing` / `pending_items`, 200 `{ id, processedAt }` matching the Zod `knowledgeSourceProcessedResponse` (`packages/shared/src/knowledge-bit-origin.ts:10-13`). There is no request body, so Zod covers only the response contract; that is acceptable for a bodyless route.
- State transition: `knowledge-source-processed.repo.ts:21-31` sets `processed_at = coalesce(processed_at, now())` (idempotent, keeps first stamp) only when status is not `processing` and no pending bit exists (`notExists`, lines 14-19, single atomic UPDATE). Reopen sets null. `status` is untouched. Migration `0096_entry_processed_and_item_origin.sql` adds the nullable column.
- Pending items remain: refused with 409 `pending_items` (repo lines 37-49), UI shows "Couldn't mark as processed. Try again." and keeps the entry. The Mark button only renders when the entry has no cards. Tested at controller level (`knowledge-source-processed.controller.test.ts:94`) and at DB level (`knowledge-source-processed.repo.integration.test.ts:159`, not run).
- Badge and list: `countPendingKnowledgeBits` joins entries and counts only `processed_at is null` (`knowledge-bit-bulk-approval.repo.ts:85-93`); the pending list filters processed entries and appends fully reviewed and processed entries (`knowledge-bit-approval.repo.ts:185-195, 282`).
- Tests I ran, all green:
  - apps/api: `knowledge-source-processed.controller.test.ts` (9), `router.test.ts` (53), `knowledge-bit-feedback-origin.test.ts` (5), `knowledge-source-item.controller.test.ts` (10).
  - apps/web: `knowledge-bit-review-panel.processing.test.tsx` and four sibling files, 71 tests in 5 files. They assert outcomes: entry moves to a collapsed "Processed (1)" section, sidebar event fires, Reopen restores and reloads cards, failure keeps the entry, undo beating a slow mark reopens on the server.
  - packages/shared: 7 tests.
- Not run (needs a DB): `knowledge-source-processed.repo.integration.test.ts`, `knowledge-bit-origin.repo.integration.test.ts`, `knowledge-bit-bulk-approval.repo.integration.test.ts`. The entries-and-items report records these as passing on the pet-projects lane DB at 127.0.0.1:5999. I did not verify that.

## (b) Manual items: evidence

- UI entry point: "Add new KI" button `knowledge-bit-review-draft-list.tsx:58-75`, shown on open and fully reviewed sources and hidden while regeneration is starting or running (`knowledge-bit-review-source-group.tsx:85, 173-178`); never offered in the Processed section (test `panel.manual.test.tsx:111`). Draft card with Front, Back, Example is browser-only: nothing is sent until Front and Back have text (`knowledge-bit-review-draft-card.test.tsx:74, 82, 91`), Cancel discards without a server call (line 149).
- API: `POST /knowledge-sources/:id/items` (plural sub-resource, `router-table.ts:33-38`). Controller `knowledge-source-item.controller.ts:8-28` validates with Zod `createManualKnowledgeItemInput` (`packages/shared/src/knowledge-bit.ts:135-144`: trimmed front max 300, back max 600, optional example max 300, empty front or back rejected) and returns 400 `invalid_input`, 404, 409 `already_running`, 201 with the pending-review item.
- Approval gate: `knowledge-bit-manual-item.repo.ts:44-55` inserts `approvalState: "pending"`, `origin: "manual"`, one `basic` variant (prompt = front, answer = back), and pre-stamps the three generation columns so background scans skip it. The insert runs in a transaction under `for("update")` on the entry row, so concurrent creates get distinct ordinals and it cannot race an extraction in progress. No model call.
- Manual items stay out of statistics: no feedback rows written, readers and the `knowledge_feedback_report` view filter `origin = 'manual'` (migration 0096; `knowledge-bit-feedback-origin.test.ts`). Regeneration keeps them (`knowledge-source-regeneration.repo.ts:75`). Grades refused with 409 `grades_not_applicable` per the 01 report.
- After creation: normal pending card with Approve and Reject, no grade controls (`draft-card.test.tsx:158`), a fully reviewed source becomes open again and the badge event fires (`panel.manual.test.tsx:142`), approving it returns the source to fully reviewed (line 178), a poll does not duplicate it (line 194), create failure keeps the typed text (line 164).
- Integration test (not run) `knowledge-bit-manual-item.repo.integration.test.ts` covers pending/manual/stamps/variant (118), ordinal after superseded bits (194), concurrency (212), processing refusal (224), no feedback rows (239), scans skipping the item (252).

## Product calls the plan flags: default already in code, and is it safe

1. Mark blocked while items are pending (409 `pending_items`, no "discard the rest"). Default in code: block. Safe: it is a single atomic UPDATE, never discards user data, the user decides each item, and the UI hides the button until all cards are decided. A bulk "reject the rest on mark" would be a new rule, not built, and the block is the conservative direction.
2. Wording "processed" vs "exhausted". Default in code: "Mark as processed" / "Processed (N)" / "Reopen". Safe: label-only, matches the `processed_at` column and the vocabulary doc; changing it later touches strings and test ids only.
3. Manual item starts pending vs approved. Default in code: pending (`knowledge-bit-manual-item.repo.ts:50`). Safe: it follows the same approval gate as every item, so an unreviewed card never reaches learner-facing reads; the cost is one extra click. It is excluded from model stats via `origin`. Switching to approved would change the badge and the review flow.

## Below the gate (Medium), recorded because it contradicts the plan

Symptom: the plan says "adding a manual item to a processed source is refused until reopened (server 409 is the backstop)". The server does not do that. A direct API call, or a stale second browser tab, can add a pending item to a processed source; the item is then hidden from the review list and the badge until the user reopens the source, so the source looks finished but holds an unreviewed card.
Module: manual item creation (`apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts:17-32`).
Mechanism: the entry row is locked and checked for `processing` only; `processed_at` is never read, and no test covers it. A similar window exists between "mark processed" and a concurrent create, because the mark UPDATE re-checks `notExists` against its own snapshot (assumption, not reproduced). The web client compensates for the in-flight case (`knowledge-bit-review-processing.ts:48-51`).
Fix: in the same locked read, refuse when `processed_at` is set (new `entry_processed` -> 409), add a controller and repo test, and correct the plan text. This is not a blocker for either todo because the UI never offers the path.

## Housekeeping noted

- `.planning/entries-and-items/todo.md` still shows all items open, and the 01 report says "Independent review: pending". The plan file step 1 says the migration is still to be applied, but the 01 report records it applied to the dev DB after a backup. Reconcile when closing out.
- `npx tsc --noEmit`, lint, the browser check on the isolated stack and the three integration suites were not run in this review.

END-OF-REPORT
