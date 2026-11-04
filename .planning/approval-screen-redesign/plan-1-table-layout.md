# Plan 1: card list layout for the approval screen (table vs list)

Scope: the list of pending suggestions only (rows, columns, inline editing, variants, per-row Approve/Reject/with-feedback, selection, keyboard, narrow screens). The three-dot actions dropdown (regenerate, compare models) and non-list states (empty, loading, regenerating, error, processed) belong to other planners and appear here only as "slot" markers. Plan only, nothing implemented.

## 1. What the learner sees (plain language)

Today every suggestion is a separate white card in a 2 or 3 column grid. To go through 40 suggestions you scan left to right, then down, and each card shows three big text boxes plus two rating rows plus four buttons, so about two suggestions fit on screen.

After this change, each source text keeps its own block, and under it the suggestions form one table, one line per suggestion:

- A line shows the question (front) and answer (back) as two short previews (two lines each, cut off with an ellipsis), a small "cards" count if the suggestion has more than one question, the quality rating if you gave one, a status label, and two buttons: Approve and Reject. Under those, two quiet text links: "Approve with feedback" and "Reject with feedback".
- Most suggestions are fine as they are, so you scan down the column and press Approve. About 10 to 12 suggestions fit on a laptop screen instead of 2.
- To edit, click the line (or press e). The line opens in place, right below itself, into a roomy editing area: front, back and example text boxes (as many question cards as the suggestion has), the quality ratings, and the optional feedback box. Nothing jumps to another page. Edits still save by themselves. Closing the line never loses an edit that is still saving.
- A tick box on each line lets you pick several suggestions and approve just those with one confirm. A tick box in the header picks every ready suggestion of that source.
- Status labels: "Ready", "Writing cards..." (still being generated, Approve disabled), "Saving..." (an edit is in flight), "Edited" (changed by you since this page loaded), "Working..." (approve or reject in progress), "Failed" (last action failed, the red message sits under the line and the button can be pressed again).
- Approved and rejected suggestions leave the table exactly as today; the follow-up bar (rate the card, pick a reject reason, Undo) still appears at the bottom.
- On a phone-width screen there is no table; each suggestion is a compact stacked item with the same preview, status, tick box and buttons, and tapping opens the same editing area.
- Keyboard: j and k move the highlighted line, a approve, r reject, Shift+A approve all of the source (all existing), plus e open or close the line and x tick or untick it.

## 2. Decision: table, but only for scanning and deciding

**Fact**: a suggestion is not flat. It has 1 to 3 question variants (kinds `wh_question`, `fill_in_the_blank`, `basic`), each with a front and back, plus one shared example, plus two ratings and optional feedback (`packages/shared/src/knowledge-bit.ts:78`, `PendingKnowledgeBitForReview`). Editing needs multi-line text boxes that grow (`field-sizing-content`).

**Recommendation**: a real table where each row is a read-only, clamped summary of the suggestion, with editing in a second "detail" row that opens under it (master-detail table). Not editable cells.

Why not editable cells: three growing text areas plus a variable number of variants in a cell makes row heights jump and breaks column alignment, and the 250 ms autosave tick (`knowledge-bit-review-autosave.ts`) per field would be mounted in the table body for every row at once.

Why a table beats a compact single-column list or accordion: the real job is triage (compare many suggestions, approve most). Aligned columns give a vertical scan path for front, back, quality and status, and a header with a select-all box. A single-column list of the same expandable rows would be nearly as good and cheaper; the table wins mostly on alignment and the select-all header. **Honest limit**: the table has only about 6 useful columns today (see section 5, model and per-suggestion source columns have no data), so the gain comes from density and scanning, not from rich data columns. If the product owner would rather not have a header row, the same row components work in a `<ul>`; the narrow-screen shell in this plan already is that list, so the fallback costs nothing.

## 3. Reuse and dependencies

- **Fact**: `apps/web/package.json` has no table or grid library. Existing tables are hand-written semantic `<table>` blocks with Tailwind (`apps/web/src/analytics/mastery-breakdown-table.tsx`, `knowledge-bit-feedback-by-model.tsx`, `content-library/library-browser.tsx`). Header style to copy: `bg-neutral-50 text-xs uppercase text-neutral-500`, cells `px-3 py-2`.
- **Fact**: `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md` (post-anki section, line 408) lists no table library.
- **Decision**: no new dependency. Reason: no sorting, filtering, paging, resizing or virtualization is needed; rows are heterogeneous (summary, error, detail, draft form), which headless table models handle poorly.
- **Proposal, not decided**: if sort/filter by quality or status, or more than about 200 rows per page, becomes a need, add `@tanstack/react-table` (and `@tanstack/react-virtual`). The TanStack family is already in the stack; it would need a TECH-STACK entry first. Virtualization conflicts with keeping editors mounted, so it is not recommended before a real need.
- Reused as is: `GradeControl`, `KnowledgeBitReviewCardGrades`, `ReviewField`/`StatusLine`/`KnowledgeBitReviewCardFields`/`ExampleField`, `useAutoSave`, `KnowledgeBitReviewVariantList`, `KnowledgeBitReviewBulkConfirm`, class constants in `knowledge-bit-review-classes.ts`, lucide-react icons (already a dependency).
- A tiny media-query hook is hand-written (about 15 lines, `useSyncExternalStore` + `matchMedia`); no maintained hook library is in the project, adding one for this is not justified. Flagged for the owner.

## 4. Accessibility

- Real `<table>`, `<caption class="sr-only">` ("Suggestions from: first 60 characters of the source text"), `<th scope="col">` headers, and the Front cell is `<th scope="row">` so a screen reader announces the question when moving across a row. Not `role="grid"`: grid promises arrow-key cell navigation and a single tab stop, which would conflict with the text boxes and buttons inside rows and the existing window-level j/k keys.
- Expand control: a real `<button aria-expanded aria-controls={detailRowId}>` named "Open details: <front>". Closed detail rows use the `hidden` attribute.
- Tick boxes are native checkboxes named "Select: <front>"; header checkbox is tri-state (`indeterminate`) and named "Select all ready suggestions".
- Highlighted line (j/k) gets `aria-current="true"` plus the existing `data-focused` and ring; scrolls into view when it changes (guarded because jsdom has no `scrollIntoView`).
- Status uses text plus an icon, never colour alone. Per-row error keeps `role="alert"`. Autosave keeps `aria-live="polite"`.
- Targets keep the 44 px mobile / compact desktop sizes already in the shared button classes.
- **Known cost**: each row adds about 5 tab stops (tick, open, Approve, Reject, two feedback links). Mitigated by j/k/a/r/e/x keys; a roving tab index is listed as a follow-up, not built.

## 5. Section: how extracted suggestions appear in the table

**Facts about the data today** (`PendingKnowledgeBitForReview`, `PendingKnowledgeSourceForReview`): a pending bit carries `id`, `body`, `background` (the example), `variants[]`, `feedback` (`rating`, `wordingRating`), `origin` (`extracted` or `manual`). The source carries `sourceText`, `extractionRun`, `extractionGrade`, `decidedCount`. There is **no** model id per bit, **no** span or snippet of the source per bit, **no** alternatives from other models, and decided bits are removed from the list. Model comparison lives on a separate page (`/admin-compare-models`), linked from the source header.

**One table per source, one row per suggestion.** Reasons: the source text, the extraction grade, regenerate, "Approve all from this source" and "Mark processed" are per-source and already sit in the source header (the actions-dropdown and states slots live there). A single flat table with a Source column would lose that context and force repeating long text. The header keeps its current content; I only replace the grid below it. A source-level selection toolbar ("3 selected: Approve selected, Clear") appears between header and table only when something is ticked.

**Columns (desktop, from left):**

| Column | Content | Notes |
|---|---|---|
| Select | checkbox | disabled when the suggestion has no cards, is being edited or being decided |
| Front (row header) | first variant's front, bold, 2-line clamp, plus open/close chevron button | for a suggestion with no cards yet: first line of `body` |
| Back | first variant's back, 2-line clamp, plus chip "+N more cards" when there are several variants | |
| Example | `background`, 1-line clamp, shown from `xl` up only | empty shows a dash |
| Quality | compact "Card 4 · Wording 3" or "Not rated" | extracted only; ratings are edited in the open row |
| Status | badge (below) | |
| Actions | Approve, Reject buttons; text links "Approve with feedback", "Reject with feedback" | links hidden for manual-origin cards, same rule as today |
| (slot) | empty cell hook reserved for the three-dot menu owned by another planner | not built here; a placeholder `<td>` is not rendered until that plan lands, only the column count constant is shared |

**Not added, with reasons**: Model column and per-suggestion Source snippet column have no data in the payload, so they are omitted rather than faked. Adding them needs an API/shared-type change (proposal for the owner, not decided here): model id on the bit, and a source excerpt or character range per bit.

**Long and multi-line text**: collapsed cells use `line-clamp-2` (Tailwind 4) with `break-words`; clamping is visual only, a screen reader reads the full text. Newlines in stored text show as spaces in the preview. The open detail row shows full, growing text boxes (existing `field-sizing-content`), so nothing is ever only readable in a tooltip. Fixed column widths (`table-fixed` with a `<colgroup>`): select 40 px, front 28%, back 32%, example 16% (xl only), quality 120 px, status 110 px, actions 200 px.

**Variants (several question cards per suggestion)**: collapsed row shows the first card and a "+N more cards" chip. The open detail row lists every card with its own Front/Back boxes and autosave line (existing `KnowledgeBitReviewVariantList`), then the shared Example, then ratings, then feedback form. Variants are not separate rows, because Approve and Reject apply to the whole suggestion, not to one card.

**Alternatives from other models**: not in the data, so not built. Planned attachment point if the API later supplies them: nested sub-rows under the detail row (one per model, each with "Use this version" that copies into the editing boxes). Not a contract in this plan; it needs the API field first. Today the learner reaches comparison through the existing link in the source header.

**Status badges** (derived in one pure function from props plus local state, so there is no new server field):

| Badge | When |
|---|---|
| Writing cards... (pulse, respects reduced motion) | suggestion has no variants yet |
| Ready | has variants and nothing else applies (this is "pending") |
| Saving... | any field of the row is dirty or in flight (the existing busy set) |
| Edited | a variant or example save succeeded for this row since the page loaded (session-only, held in the row-state hook; resets on reload, stated honestly in the label's tooltip-free design: it is only a hint, not stored) |
| Working... | approve or reject in flight (`isBitResolving`) |
| Failed | the row has an error message |

Approved and rejected never show as badges in this table: the existing contract removes those rows immediately and the follow-up bar offers Undo (which restores the row). Keeping decided rows in place with strikethrough would need a new retained-rows state and clashes with the Processed section owned elsewhere; rejected as an option.

**Bulk selection**: tick boxes plus per-source header tick; selection lives in a small hook, is cleared automatically for rows that disappear (decided, superseded), and ignores rows without cards. "Approve selected (N)" uses the same confirm component and the same bulk endpoint (`useBulkApproval`) with a new scope kind `selected` listing the ids. Existing "Approve all ready" and "Approve all from this source" remain unchanged. No bulk reject: there is no endpoint, and N sequential rejects would each open the follow-up bar (default chosen, section 9).

**Manual "Add new KI" drafts**: a draft is a full-width row (single `<td colSpan>`) rendered after the suggestion rows with the existing Front/Back/Example form; once created it keeps that form with Approve/Reject (as today) instead of switching to a summary row, so typing is never interrupted. Not selectable.

## 6. Architecture (technical)

No new module boundary or data contract except one client-side addition: bulk-approval scope `selected` (ids array, same endpoint and body). All state stays in the panel as today. New pieces:

- Row shell split: `table` shell, `row` controller (summary row, optional error row, detail row), `compact-row` for narrow screens. Both shells use the same summary pieces and the same `RowHandlers` bundle type, so behaviour is identical.
- `KnowledgeBitReviewItem` becomes the row controller (it already owns the busy set, `onEditingChange`, disabled rules); it now renders table rows instead of an `<li>`.
- Detail editors mount on first open and then stay mounted (hidden when closed), so closing never drops an edit and rows nobody opens cost nothing. Busy rows cannot be unmounted by closing.
- Row-state hook (selection, open rows, edited ids) lives beside the panel; `x`/`e` actions are added to `knowledge-bit-review-keyboard.ts` (`ReviewKeyAction`), still ignored while typing.
- Narrow screens: `useIsWideScreen` (`min-width: 768px`). Server render and tests without `matchMedia` default to wide, so the first paint on a phone is the table for a moment (hydration flash). Alternative of rendering both shells with CSS is rejected: it duplicates every test id.
- `knowledge-bit-review-item-actions.tsx` splits into action buttons (lives in the Actions cell) and a feedback form (lives in the detail row); the chosen feedback mode is held by the row controller. All existing `data-testid` values are preserved: `knowledge-bit-review-item-*`, `-approve-*`, `-reject-*`, `-approve-feedback-*`, `-reject-feedback-*`, `-feedback-text-*`, `-feedback-submit-*`, `-edit-prompt-*`, `-edit-answer-*`, `-edit-example-*`, `-no-variants-*`, `-error-*`, `-draft-*`, `-card-quality-*`, `-question-wording-*`.

## 7. Steps (ordered; paths under `apps/web/src/knowledge-bit/`; "review-" = `knowledge-bit-review-`)

1. **Panel split, no behaviour change** (do first so other planners rebase on it): `review-panel.tsx` 474 lines to about 150. Move approve/reject/saveGrades/saveVariant/saveBit/saveExtractionGrade/saveDecisionNote into `review-decisions.ts` (`useReviewDecisions`), and `refreshQuestions` + idle/polling state + `handleEditingChange` into `review-refresh.ts` (`useReviewRefresh`). Keep the `processing`/`decision` declaration order (they reference each other through closures). Run the nine existing `review-panel.*.test.tsx` files unchanged; all must pass.
2. Add `review-row-types.ts` (the shared handler bundle type: `onApprove`, `onReject`, `onSaveVariant`, `onSaveBit`, `onSaveGrades`, `onEditingChange`). Use it in `review-item.tsx`, `review-draft-list.tsx`, `review-draft-card.tsx`, `review-source-group.tsx` to cut repeated prop lists.
3. Add `review-row-status.ts` (pure `deriveRowStatus`) and `review-status-badge.tsx`; add `review-wide-screen.ts` (`useIsWideScreen`); add `review-row-state.ts` (selection, open rows, edited ids; prunes ids no longer present). Unit tests for each.
4. Split `review-item-actions.tsx` into the buttons (Approve, Reject, two feedback links) and new `review-feedback-form.tsx` (textarea + submit); keep all test ids and the disabled rules; update `review-item-actions.test.tsx`.
5. Build the table: `review-table.tsx` (caption, colgroup, thead with tri-state select-all, tbody), `review-row-summary.tsx` (cells), `review-row-detail.tsx` (variant list, example, grades, feedback form, in the `hidden` detail row). Convert `review-item.tsx` into the row controller that renders summary `<tr>`, an error `<tr role="alert">` only when needed, and the detail `<tr>`. Table-column constants in `review-classes.ts`. Update `review-item.test.tsx` to render inside a `<table><tbody>`.
6. In `review-source-group.tsx` replace the `<ul class="grid ...">` with the table (header block untouched, keep its slots); `review-draft-list.tsx` / `review-draft-card.tsx` render the draft as a `<tr><td colSpan>` row; update `review-draft-card.test.tsx` wrappers.
7. Add `review-compact-row.tsx` and use it when `useIsWideScreen()` is false (stacked `<ul>` of items with the same summary pieces, tick box, status, buttons, open/close).
8. Selection: add `review-selection-bar.tsx`; extend `review-bulk-approval.ts` `PendingBulk` with `{ kind: 'selected'; ids: string[] }` and `confirmBulk` filtering by ids (ready rows only, as today); wire the confirm via `KnowledgeBitReviewBulkConfirm` with new test ids `...-approve-selected-*`.
9. Keyboard: add `toggle-select` (x) and `toggle-open` (e) to `review-keyboard.ts`, handle them in the panel's `handleKey`, add `aria-current` and scroll-into-view in the row controller, update the hint text in `review-bulk-bar.tsx`.
10. Update the panel tests that edit text or press feedback links: open the row first (helper `openRow(bitId)` in the nearest existing test helper, otherwise a co-located `review-test-helpers.ts`). Run `npx vitest run src/knowledge-bit`, `npx tsc --noEmit` (web). Browser check only on the isolated e2e stack at :5550, never :5540/:5562; use the clear-extraction script first if extraction is needed.

File-size result: panel about 150, item about 130, table about 110, summary about 100, detail about 90, source-group about 190 (down from 217), every new file under 150, none over 300.

## 8. Tests (react-testing-library + vitest, co-located, names state the guarantee)

- Table (`review-table.test.tsx`): "shows each suggestion of a source as one row under labelled columns"; "announces the question as the row heading"; "clips long front and back text in the row but shows it whole in the opened row"; "lists every question card of a suggestion in the opened row and a +N chip in the closed row".
- Row (`review-item.test.tsx`): "opens editing in place without leaving the list"; "keeps saving an edit after the row is closed"; "approves straight from the closed row"; "rejects straight from the closed row"; "sends the typed note with Approve with feedback"; "disables Approve and shows Writing cards for a suggestion with no cards"; "hides feedback links for manually added cards"; "shows the error under the row and lets the learner retry".
- Status (`review-row-status.test.ts`, `review-status-badge.test.tsx`): one case per badge including "marks a row Edited only after a save succeeds".
- Selection (`review-row-state.test.ts` + panel bulk test): "approves only the ticked suggestions after confirming"; "select all picks only suggestions that are ready"; "drops a selection when that suggestion is decided elsewhere"; "cannot tick a suggestion that is still writing or being edited".
- Keyboard (`review-keyboard.test.ts`, panel): "x ticks the highlighted row and e opens it"; "does nothing while typing in a text box"; "j and k move the current-row marker for assistive tech".
- Narrow screen (`review-compact-row.test.tsx`, `review-wide-screen.test.ts`): with a mocked narrow `matchMedia` "shows stacked items instead of a table and still approves, rejects and opens editing"; "defaults to the table when the browser cannot report screen width".
- Drafts: "shows the new-item form as a full-width row and focuses Front".
- Regression: all nine existing panel test files keep passing except for the added `openRow` step.

## 9. Defaults chosen

- Table with expandable detail row over editable cells: keeps alignment and keeps three growing text areas out of cells.
- One table per source: source actions, extraction grade and bulk-by-source are per source already.
- Semantic `<table>`, not `role="grid"`: avoids composite-widget key handling that would clash with j/k and text boxes.
- No new dependency: nothing needed beyond a plain table; `@tanstack/react-table` is only proposed for later sorting/filtering.
- Detail editors mount on first open and stay mounted: protects in-flight autosaves, saves DOM for untouched rows.
- Approve and Reject visible in the closed row; "with feedback" as text links that open the row: keeps one-click decisions and keeps the feedback box roomy.
- Status "Edited" is session-only and derived on the client: avoids a schema or API change.
- Approved/rejected rows keep leaving the list (Undo strip unchanged): matches current contract and the Processed section.
- No Model or Source-snippet column and no alternatives rows: no data in the payload; extra fields are proposals for the owner.
- No bulk reject: no endpoint, and each reject opens the follow-up bar.
- Selected-approve reuses the existing bulk endpoint and confirm step: consistency with "Approve all".
- Narrow screens use a stacked list via `matchMedia` (default wide on server): duplicated markup via CSS would duplicate test ids and break table semantics.
- Panel split is step 1 and behaviour-neutral: panel is over the 300-line limit and other plans touch it.
- No sticky header and no virtualization: page scroll plus per-source tables keep headers close; row counts are small (bulk limit 200).

## 10. Done when

- Each source shows a real table with a caption, column headers, one row per suggestion, and draft rows full width; no card grid remains.
- A closed row shows clamped front and back, status, quality, Approve, Reject and the feedback links; an opened row shows all editing boxes, ratings and the feedback form; closing during an edit never loses it.
- Approve, Reject, with-feedback, bulk approve (all, per source, selected), undo bar, autosave and per-row errors behave as before (existing tests pass, with only the open-row step added).
- Ticking rows and pressing Approve selected plus Confirm approves exactly those; select-all ignores not-ready rows.
- x, e, j, k, a, r, Shift+A work and are ignored while typing; the current row has `aria-current`.
- Below 768 px the screen shows the stacked list with the same actions.
- No file over 300 lines (panel included); `npx tsc --noEmit` clean for web aside from any error present before this work; `npx vitest run src/knowledge-bit` green.
- Slots left for the actions dropdown and the non-list states are untouched placeholders, nothing of theirs implemented.

## 11. Risks and sequencing notes

- Other planners edit the same files (`review-source-group.tsx` header, `review-panel.tsx`). Land step 1 first and keep the header block untouched.
- Hydration flash on phones from the wide default (section 6).
- Many tab stops per row until a roving tab index is added.
- Facts that are not checked: no browser run was done while planning; table row heights with real data (long Russian or English text) should be judged in the e2e stack.

END-OF-REPORT
