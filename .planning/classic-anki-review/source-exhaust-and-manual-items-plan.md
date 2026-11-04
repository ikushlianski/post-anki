# Plan: source exhausted -> processed, and items added by hand (classic-anki-review)

## Key finding (Fact, from the working tree)
Both todos already have code in the uncommitted tree, built under `.planning/entries-and-items/` (brief.md, features 01, 02, 04, 05; its own todo.md still shows them as open). The vocabulary there: "source" = entry, "exhausted" = "processed" (`knowledge_sources.processed_at`), "knowledge item" = `knowledge_bits` row. So the work left is verification and closing out, not new design. Do not re-implement.

The other agent's files (`knowledge-bit-review-item-actions.tsx` and the review-card components) are out of scope here; nothing below edits them.

## Todo (a): Move a source to processed when the user marks it exhausted
- User-visible: a fully reviewed source stays on the approve page with a "Mark as processed" button. Marking moves it into a collapsed Processed section with Reopen, and its pending items drop out of the sidebar badge. Reopening restores it.
- API (exists): `POST /knowledge-sources/:id/processed` marks, `DELETE /knowledge-sources/:id/processed` reopens. 200 `{ id, processedAt }` (Zod `knowledgeSourceProcessedResponse` in `packages/shared/src/knowledge-bit-origin.ts`). 400 `invalid_id`, 404 `not_found`, 409 `entry_processing` (extraction running) or 409 `pending_items` (mark refused while any item is still pending).
- UI entry point (exists): Mark as processed on the fully reviewed source group; Processed section `apps/web/src/knowledge-bit/knowledge-bit-review-processed-section.tsx`; client `markKnowledgeSourceProcessedForReview` / reopen in `knowledge-bit-review.api.ts`.
- State transitions: `processed_at` null (open) <-> timestamp (processed). Only the user changes it, no automatic transition. `knowledge_sources.status` (pending/processing/detected/failed) is untouched, so extraction logic is unaffected. Adding a manual item to a processed source is refused until reopened (UI hides the button there; server 409 is the backstop).
- Files: `apps/api/src/knowledge-source/knowledge-source-processed.{repo,controller}.ts` (+ tests), `apps/api/src/db/schema.ts`, migration `0096_entry_processed_and_item_origin.sql`, `router-table.ts`, `router.ts`, `api-server.ts`, `packages/shared/src/knowledge-bit.ts` (`processedAt`), `knowledge-bit-bulk-approval.repo.ts` (badge predicate), web files named above.
- Tests (exist; run, do not rewrite): `knowledge-source-processed.controller.test.ts`, `knowledge-source-processed.repo.integration.test.ts` (mark/reopen idempotency, `pending_items`, processing refusal, badge excludes processed), `knowledge-bit-review-panel.processing.test.tsx`, storybook `knowledge-bit-review-processed.stories.tsx`.

## Todo (b): Add new knowledge items by hand to an existing source
- User-visible: each open or fully reviewed source has an "Add new KI" button. It opens a draft card (Front, Back, Example). Nothing is sent until Front and Back both have text; Cancel discards. After saving it is a normal pending card: Approve, Reject, autosaved edits, no grade controls. Regenerate never discards it.
- API (exists): `POST /knowledge-sources/:id/items` (plural sub-resource). Body Zod `createManualKnowledgeItemInput` in `packages/shared/src/knowledge-bit.ts`: trimmed `front` (max 300), `back` (max 600), optional `example` (max 300); empty front/back -> 400 `invalid_input`. 201 returns the pending-review item shape; 404 `not_found`; 409 `already_running` while extraction is running, 409 `entry_processed` when the source is processed (reopen first). Never calls a model.
- UI entry point (exists): `knowledge-bit-review-draft-list.tsx` (button), `knowledge-bit-review-draft-card.tsx`, `knowledge-bit-review-manual-drafts.ts` (hook), wired in `knowledge-bit-review-source-group.tsx` and `knowledge-bit-review-panel.tsx`.
- State transitions on the new item: created `approval_state = pending`, `origin = manual`, one `basic` variant (prompt = front, answer = back), generation columns pre-stamped so background scans skip it; then pending -> approved/rejected through the existing approval path. A fully reviewed source with a new pending item becomes open again.
- Files: `apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts`, `apps/api/src/knowledge-source/knowledge-source-item.controller.ts` (+ tests), `schema.ts` (`origin`), shared Zod, feedback repos (manual items write no feedback rows; grades refused 409 `grades_not_applicable`), web draft files above, `apps/web/src/curriculum/api-client.ts`.
- Tests (exist; run, do not rewrite): `knowledge-source-item.controller.test.ts`, `knowledge-bit-manual-item.repo.integration.test.ts` (ordinal, concurrency, scan skipping, no feedback rows), `knowledge-bit-origin.repo.integration.test.ts`, `packages/shared/src/knowledge-bit.test.ts`, `knowledge-bit-review-draft-card.test.tsx`, `knowledge-bit-review-panel.manual.test.tsx`, story `knowledge-bit-review-add-item.stories.tsx`.

## Approval gate (answer to "pending or approved?")
Manually added items start **pending**, not approved. Reason: they flow through the same approve/reject path as every other item (`.planning/prose-knowledge-fisher--ki-approval-gate/spec.md` has no manual-item rule; the gate makes every `knowledge_bits` row default to `pending`), and `.planning/entries-and-items/brief.md` records this as a decision. They are excluded from model statistics and reviewer memory via `origin = manual`.

## Steps (close-out; no new feature code)
1. Apply migration 0096 to the dev DB only after a backup, via the existing migrate script (memory: dev DB on :5562 is prod-like; no ad-hoc writes). Human or coordinator step.
2. Run `npx vitest run` on the test files listed above (API integration tests need the pet-projects lane DB, never :5562), then `npx tsc --noEmit` and lint, all zero-issue.
3. Browser check on the isolated stack (`npm run e2e:stack:up`, port 5550), never the dev app: mark processed, reopen, add a manual item on an open and a fully reviewed source, approve it, confirm badge counts.
4. Tick the two todos in `.planning/TODO.md` via the todo-factory CLI (never a direct edit); "done" stays human-only. Commit only when asked.

## Needs a human product decision
- Mark-processed is blocked (409 `pending_items`) while any item is pending; the user must approve or reject first. If "exhausted" should also allow "I am done, discard the rest", that is a new rule (bulk reject on mark) and is not built.
- Wording: UI says "processed"; the todo says "exhausted". Confirm the button label.
- Whether a manual item should instead start approved (skip review for the user's own text). Default above is pending; changing it alters the badge and review flow.

## Defaults chosen
- Reuse the existing entries-and-items implementation: it matches the brief and is already tested.
- `processed_at` timestamp instead of a new `status` value: reversible, leaves extraction status logic alone.
- Manual items pending: same gate as all items.
- Routes under `/knowledge-sources/:id/...`: the table is not renamed yet.

END-OF-REPORT
