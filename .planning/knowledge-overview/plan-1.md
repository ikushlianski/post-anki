# Plan 1: knowledge overview, move between decks, keyboard bulk delete

Binding architecture: `.planning/classic-anki-review/brief.md` (no brief.md exists in this task dir). No repo-root CLAUDE.md.

## Goal
One /knowledge page lists every approved card, filterable by subject, where the user selects many by keyboard and moves them to another subject or permanently deletes them in one request each.

## Approach
Facts: "deck" = subject. A bit has no subject column; it inherits one (placed: topic > curriculum.subjectId; unplaced: knowledge_sources.subjectId), via the `case when topic_id is null` idiom in reviewed-today and subject-review-due-counts repos, `coalesce` in suspended.repo, `or(...)` in queue-picked.repo. Nothing hard-deletes a bit today; reject only works from pending. `knowledge_bit_feedback` rows hold their own statement/front/back/subject copies (no FK). `approval_state` is unconstrained text.
- Migration NEEDED: `knowledge_bits.subject_id text null` (+ index). Move cannot edit the source subject (siblings would move). Effective subject = `coalesce(knowledge_bits.subject_id, <existing case>)`, in one new helper `knowledge-bit-subject.ts`, adopted by the four sites above so due counts and scoped review follow a move. On move also set topic_id=null, placement_suggestion=null, placement_checked_at=now (old topic belongs to the old subject; stops the placement scan re-placing it).
- Delete = permanent, approved bits only, in one transaction: variants, attempts (by variant id), reviews, schedule, tag_assignments (nodeType knowledgeBit), then the bit; feedback rows kept. Confirm dialog states the count.
- API (controller + repo per entity, mirroring bulk-approval): `GET /knowledge-bits/overview?subjectId&q&limit&offset`, `POST /knowledge-bits/moves`, `POST /knowledge-bits/deletions`. Zod in new `packages/shared/src/knowledge-bit-overview.ts`: ids 1..200 (`KNOWLEDGE_BIT_BULK_MAX_IDS`), move adds subjectId. Response `{moved|deleted: id[], skipped:[{id, reason: not_found|not_approved}]}`; unknown subject 404 `subject_not_found`; lock rows `for update`.
- Web: react-query + createServerFn like the suspended page (no electric shape exists for bits). Subject options/path labels from `subjectsCollection` + `buildSubjectPathLabel` (@post-anki/core). Subject filter includes descendants (`collectSubjectSubtreeIds` server side).
- "Manage" = row suspend/unsuspend (existing `updateCardSchedule`), move, delete. Card edit stays out.

## Steps (one dispatch each; footprints do not overlap)
A. Contracts: new `packages/shared/src/knowledge-bit-overview.ts` + `.test.ts`, one export line in `index.ts` (dirty file, add only that hunk).
B. Migration: add column in `apps/api/src/db/schema.ts` (dirty; only that hunk), `npm run db:generate` in apps/api, review SQL, `npm run db:migrate`. Run AFTER in-flight migrations 0093-0096 are committed; otherwise stop and report.
C. Subject helper + adoption: new `apps/api/src/knowledge-bit/knowledge-bit-subject.ts`; swap expression in `knowledge-bit-review-queue-picked.repo.ts`, `subject-review-due-counts.repo.ts`, `knowledge-bit-suspended.repo.ts`, `knowledge-bit-reviewed-today.repo.ts` (staged-new by someone else: one-line swap, do not restage their work). Existing tests must stay green.
D. Overview read: extract `pickPreferredVariants` into new `knowledge-bit-preferred-variant.ts` (used by suspended.repo too); new `knowledge-bit-overview.repo.ts` (state: new|learning|review|relearning|suspended|buried, dueAt, lapses; q = escaped ILIKE on prompt/answer; approved + live variant only; order created desc, id asc) + `.controller.ts`; routes in `router.ts`, `router-table.ts`, `api-server.ts` (all dirty; add only own hunk, literal path before the `/:id` regexes).
E. Move: `knowledge-bit-move.repo.ts` + controller + route entries (shares router files with D, so run after D).
F. Delete: `knowledge-bit-delete.repo.ts` + controller + route entries (after E, same router files; repo work could run parallel to E).
G. Web data: `knowledge-overview.api.ts` (3 server fns), `knowledge-overview-selection.ts` (set, anchor, cursor, cap 200, prune on data change), `knowledge-overview-keyboard.ts` (pure `resolveOverviewKey`, reuse `isTypingTarget`), `knowledge-overview-result.ts` (messages, like `knowledge-bit-review-bulk-result.ts`). Needs A only; parallel with C-F.
H. Web UI: `knowledge-overview-table.tsx`, `-page.tsx`, `-screen.tsx`, `-delete-dialog.tsx`, `-move-dialog.tsx` (all in apps/web/src/knowledge-bit/), `routes/knowledge.index.tsx`, nav link in `nav/sidebar.tsx` (dirty; one Link), regenerate `routeTree.gen.ts` with the tool, never hand-edit. After G; can use mocked api before D-F land.
I. Wiring check: invalidate overview, suspended and due-count query keys after mutations (grep their keys); browser check on the e2e stack :5550 only, never :5540/:5562.

## Keyboard and a11y (H)
- Table `role="grid" aria-multiselectable`, rows `aria-selected`, roving tabindex; handler on the grid, ignored when typing in filter/search. Checkboxes tabindex -1 (mouse path; Shift+click ranges).
- ArrowUp/Down move row focus; Home/End; Space toggles; Shift+Arrow selects anchor..cursor; Ctrl/Cmd+A selects all loaded rows (cap 200, announced if capped); Escape clears; M opens move; Delete/Backspace opens delete. With nothing selected, M/Delete act on the focused row.
- Delete dialog `role="alertdialog"`, aria-modal, labelled by title "Delete N cards permanently?", Tab trapped, initial focus on Delete button so Enter confirms, Escape cancels, ignores `event.repeat`. Move dialog: SubjectCombobox autofocused, "Move N cards" disabled until a subject is chosen, Enter confirms, Escape cancels.
- Focus: cancel returns to the prior row; after delete/move focus goes to the next surviving row, else previous, else the page heading (`focus-page-heading.ts`).
- Reuse `useReviewAnnouncer`/`KnowledgeBitReviewAnnouncer`: polite for "3 selected" and results ("Deleted 3 cards. 1 already gone."), assertive for failures. Show "Selected N" bar with Move/Delete/Clear buttons for pointer users.

## Tests (vitest, co-located, `npx vitest run`, never `npm test`)
- API integration (`npm run test:integration`, pet-projects DB lane): overview filters (subject with descendants, override wins, q), states; move changes effective subject in due counts and scoped queue, clears topic, skips non-approved, rejects unknown subject, atomic; delete removes dependents, keeps feedback, skips non-approved. Controller tests: 400 on 0, 201, duplicate-safe ids.
- Unit: selection (range, cap, prune), keyboard resolver, result messages, state derivation, shared Zod.
- Web: dialog tests (Enter confirms, Escape cancels, focus restored), screen test `routes/-knowledge.index.test.tsx` modeled on `-knowledge.suspended.test.tsx`, plus a keyboard-only flow: select range, Delete, Enter.

## Done when
- /knowledge lists approved cards with question, answer preview, subject path, state/due; subject filter and search work.
- Keyboard-only: select, extend, select all, clear, move (M), delete (Delete + Enter) all work with announcements and sensible focus.
- Move changes the card's subject everywhere (queue, due counts, suspended, reviewed today); sibling bits in the same source unaffected.
- Delete removes the bit and its schedule/variants/reviews/tags, keeps feedback; each bulk action is one transactional request, max 200.
- tsc, lint, unit and integration tests clean; all files under 300 lines; migration generated and run through the migrate script.

## Defaults chosen
- Hard delete behind count-confirm: soft state would touch ~10 approval_state gates (several in dirty files) and no restore UI is requested.
- New nullable `subject_id` column over editing the source: siblings must not move.
- Route `knowledge.index.tsx` (/knowledge): no layout file, so existing sub-routes are unaffected.
- Flat `knowledge-overview-*` files in knowledge-bit/: matches the folder's existing convention.
- react-query + server fns, offset pages of 50: same as suspended page; selection cap 200 matches the server cap.
- Overview shows approved cards only: pending/rejected belong to the approval screen.
- Actions on the focused row when nothing is selected: faster, still confirmed by count dialog.
- Feedback rows keep their original subject: they describe extraction history, not current placement.

END-OF-REPORT
