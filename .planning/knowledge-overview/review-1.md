# Review 1: knowledge overview (units A, D, F, G, H)

Verdict: PASS (no Critical or High findings; 4 Medium, 5 Low)
Mode: B (no spec.md/scenarios.md; contract = plan-1.md + impl-report-1/2.md). Move, migration and the effective-subject adoption are out of scope by instruction.

## Checks run
- npx tsc --noEmit: apps/api exit 0, apps/web exit 0.
- npx vitest run on new files: web (selection, keyboard, result, delete-dialog, routes/-knowledge.index, sidebar) 56 passed; api (overview-state, overview.controller, delete.controller, router.test) 62 passed; packages/shared knowledge-bit-overview 5 passed.
- Integration test knowledge-bit-overview-delete.integration.test.ts NOT run (per instruction, creates a DB); its claims are read-only verified.
- Lint: none configured.

## Critical / High
None.

## Verified against the brief
- Bulk delete: one transaction (knowledge-bit-delete.repo.ts:18), rows locked with FOR UPDATE (:31), approval state decided under the lock (:33-34), only approved ids deleted, ids de-duplicated. Dependents removed in a safe order: attempts (by all variant ids, superseded included), reviews, schedule, tag_assignments (nodeType knowledgeBit), variants, bit. Schema has no FK from these tables to knowledge_bits, so no missed FK dependent; knowledge_bit_feedback is untouched (kept).
- Cap 200: server via bulkDeleteKnowledgeBitsInput (shared/knowledge-bit-overview.ts:44, controller returns 400, unit tested at 201 and 0); client via OVERVIEW_SELECTION_CAP = KNOWLEDGE_BIT_BULK_MAX_IDS in toggle/extend/select-all, plus the server-fn input validator re-parses.
- Overview query: approved (bitApproved) AND live variant (exists, supersededAt null); subject filter uses collectSubjectSubtreeIds (descendants) against coalesce(curriculum subject, source subject); order created desc, id asc (stable); limit+1 for hasMore; joins are 1:1 so no row duplication; display variant via the shared pickPreferredVariants (suspended.repo now imports it, behavior unchanged).
- SQL injection / ILIKE: q is a bound parameter; escapeLikePattern escapes backslash, percent, underscore; empty/whitespace q applies no filter; q capped at 200; limit capped at 100. Integration test covers a literal "100%".
- Keyboard: resolver ignores typing targets (INPUT/TEXTAREA/SELECT/contenteditable), buttons and Alt; repeat ignored for Space/Escape/Delete/Backspace/Ctrl+A, allowed for arrows; Shift+Delete ignored. Grid handler never handles Enter; the dialog is rendered outside the grid, so its keys cannot bubble into it, and it also stops propagation. Dialog: alertdialog, aria-modal, labelled, initial focus on Delete (Enter confirms), Escape cancels (not while busy), Tab trapped, held Enter prevented. preventDefault on handled grid keys (Space does not scroll).
- Focus: cancel returns to the cursor row; after delete next surviving row, else previous, else page h1 (focusPageHeading). Roving tabindex: one row and its Suspend button are tab stops; checkboxes tabindex -1 and clicking one moves focus back to the row so shortcuts keep working.
- Selection pruning: pruneSelection on row-id change (effect keyed on ids), selectedInOrder filters to loaded rows so a stale id can never be sent; tested.
- Messages: success "Deleted N cards. X already gone. Y not approved, so kept."; not_found rows removed from the list; failure shown inline in the dialog and announced assertively; dialog stays open.
- No `any` in reviewed files. All source files under 300 lines (largest: selection.ts 166, table 177).

## Medium
1. Whole page is replaced by "Could not load cards." on any query error, losing the table and selection. knowledge-overview-screen.tsx:43 uses query.isError, which is also true when a background refetch (the invalidate right after a successful delete, or Load more) fails while data is still present. Symptom: a successful delete is followed by the list vanishing with no retry control and focus lost. Fix: show the error only when there is no data; otherwise keep the table and show a non-blocking banner with Retry.
2. Integration test title overstates coverage. knowledge-bit-overview-delete.integration.test.ts:129 "should remove an approved bit with its dependents but keep its feedback rows" never inserts or asserts a feedback row, and reviews and tag_assignments are neither seeded nor asserted. The headline guarantee (feedback kept, tags/reviews removed) is therefore untested; it was also not run. Add feedback, review and tag rows and assert them.
3. No test that the delete is atomic or de-duplicates ids (plan: "duplicate-safe ids", "atomic"). Repo has the behavior; nothing proves it. Add an integration case with duplicate ids and a forced mid-way failure rolling back.
4. apps/web/src/routes/-knowledge.index.test.tsx is 320 lines, over the 300-line limit (plan "Done when"). Split the filter/suspend cases into a second co-located file.

## Low
1. delete.repo locks rows with no ORDER BY; two concurrent bulk operations on overlapping ids in different scan order can deadlock (one gets a 500). Add .orderBy(knowledgeBits.id) before .for("update") (knowledge-bit-delete.repo.ts:27-31).
2. Search matches any live variant's prompt/answer but the row shows only the preferred variant, so a result may not visibly contain the search text (knowledge-bit-overview.repo.ts:28-44).
3. effectiveSubjectIdSql uses coalesce(curricula.subjectId, source.subjectId) while the four existing sites use `case when topic_id is null`. They differ only when a placed bit's curriculum has no subject; overview and due counts could then disagree. Resolve when unit C adopts the helper.
4. Deletions return 200, the plan's test list says 201 (documented in impl-report-1 as mirroring bulk approvals; accept or align). router.test.ts has no entries for /knowledge-bits/overview or /deletions, so route-order regressions against the /:id regexes are unguarded.
5. Failure copy "Nothing was removed." (use-knowledge-overview-delete.ts / knowledge-overview-result.ts) is asserted even for a network timeout where the server may have committed; subject cell is blank until the subjects collection loads or for an unknown subject; delete dialog names a count only, not the card when acting on the focused row; checkbox aria-label embeds the full question text.

## Test quality
Names state business guarantees (range/shrink/cap/prune/focus-after-removal, keyboard-only flow, Backspace in search ignored, failure announced assertively, dialog Enter/Escape/Tab/held Enter). Unit and web coverage is good; the gap is the integration level (Medium 2-3).

END-OF-REPORT
