# Plan 3: every state of the approval screen (non-list states and shared feedback)

Scope: loading, empty, progress, errors, notices, status labels, accessibility, mobile, plus the file split of `knowledge-bit-review-panel.tsx`. Not in scope: the card list layout (plan 1) and the three-dot menu (plan 2); only the points where a state touches them are noted. Paths are under `apps/web/src/knowledge-bit/`; "review-" means `knowledge-bit-review-`. Read-only audit: nothing was edited.

## 1. Goal

Make every state of the approval screen say what is happening, what the learner can do next, and never lose their typing or mislead them, without changing what approve, reject, regenerate and bulk approve do.

## 2. Top findings by learner impact (symptom first)

1. **P0, "Could not approve" after a successful bulk approve.** The server can skip a card as `superseded` (`apps/api/src/knowledge-bit/knowledge-bit-bulk-approval.repo.ts:78`). The web phrase table in `review-bulk-result.ts` has no entry for it, so building the message throws, the catch shows "Could not approve these suggestions. Try again.", although the cards were already removed from the screen. The shared type already lists `superseded` (uncommitted change in `packages/shared/src/knowledge-bit.ts`), so `tsc` should also fail here.
2. **P0, the empty state can be wrong.** A text that is still being read (no cards yet) is not listed at all (`listPendingKnowledgeBitsForReview` only returns sources with pending cards, `apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts:173-190`). The learner who just pasted text sees "No pending knowledge bits. Everything is decided." A failed extraction is invisible too (the source table has `status` and `failureReason`, `apps/api/src/db/schema.ts:1091-1100`).
3. **P0, a failed card save blocks Approve with no explanation.** The Approve button is greyed out, the only hint is a 12px grey-red line "Could not save. Edit again to retry" with no button.
4. **P0, a lost approval note.** When a note typed with "Approve with feedback" fails to save, the strip says "Couldn't save the note." but the approved strip has no text box and the text is dropped (`review-panel.tsx:222-231` never passes `note` for approvals). The strip also closes by itself after 10 seconds even while this error is showing.
5. **P0, regeneration can leave the learner with nothing.** The old suggestions are replaced when regeneration starts. If the run then fails, the group is empty with "Couldn't regenerate. Try again." and no warning that the old ones are gone. After the poll budget (200 x 3 s = 10 minutes) "Regenerating…" stays forever with the button disabled. If the run finishes with nothing new, the group vanishes with no message.
6. **P1, silent polling.** A failed background check is swallowed (`review-polling.ts:98`); learners see "Writing cards…" indefinitely. After about 5 minutes the card says "Reload the page" and the page-level progress line disappears. After 2 quiet minutes the page stops looking for new suggestions and says nothing.
7. **P1, no loading and no load error.** `routes/knowledge-bit-review.tsx` has no `pendingComponent` or `errorComponent`, and `router.tsx` has no defaults.
8. **P1, nothing is announced.** The progress line has no live region; approve/reject make the card vanish and keyboard focus drops to the page; bulk errors use `role="status"`; focus is lost when "Approve all" turns into Confirm.
9. **P1, low contrast and small text** for the saving status (`text-neutral-400` on white is about 2.5:1, AA needs 4.5:1; `text-neutral-500` is about 4.7:1), and 11px strip hints.
10. **P2, vocabulary** mixes "knowledge bits", "items", "suggestions", "cards", "KI", "entry", "texts".

## 3. State-by-state audit

Format: Sees now / Problem / Improvement (copy in quotes). Priority in brackets.

**S1 Page loading [P1].** Sees now: on client navigation the old page stays until the loader finishes, no indicator. Fix: route `pendingComponent` with 3 grey skeleton group blocks inside `role="status"` and the text "Loading your suggestions…" (new `review-loading.tsx`).

**S2 Page load fails [P1].** Sees now: the router default error screen (Assumption: TanStack's default shows the raw error message). Fix: route `errorComponent`: "We couldn't load your suggestions. Nothing has been lost." with "Try again" (`router.invalidate()`) and a link "Go to home". `role="alert"`. New `review-load-error.tsx`.

**S3 Nothing to review [P0 copy, P1 variants].** Sees now: one bold line plus two links, with "Review" next to a page called "Approve suggestions". Fix, three variants chosen from data already on the page (`processedSources.length`, `caps`):
- First time (no processed sources, no decided count): "Nothing to approve yet." / "Add some text and we'll suggest question cards from it." Button-style link "Add knowledge".
- All done: "You're all caught up." / "Every suggestion has been approved or rejected." Links "Add knowledge" and "Study approved cards" (replaces the bare "Review").
- Interim wording until S4 ships, used in both: "This page keeps checking for new suggestions for a couple of minutes." Plus "Check now" (see S5).
Existing test asserts the old sentence and must change.

**S4 A text is still being read, or reading failed [P0, needs a backend field].** Sees now: nothing. Fix: add optional `extractionStatus?: 'extracting' | 'failed'` and `failureReason?` to `PendingKnowledgeSourceForReview` (shared); API also returns open sources with zero cards that are still processing or failed (Assumption: the `status` values are `pending/processing/detected/failed`, per the comment at `schema.ts:1091-1104`; verify). Web: new `review-extraction-status.tsx` group stub: extracting: "Reading this text and writing suggestions… This page updates by itself." with a pulsing dot (respects `motion-reduce`); failed: "We couldn't make suggestions from this text." + the reason in plain words + link "Add it again". Ship the web side behind the optional field; the API change is a separate backend todo. Needs the owner to confirm the API change (cross-team: dashboard counts).

**S5 Cards arriving while polling [P1].** Sees now: per-card "Writing cards…" and a top line "Writing cards… 3 of 8 ready" (no live region, no bar); quiet-stop and gave-up are silent or a per-card "Reload the page". Fix: one status strip at the top of the panel (new `review-live-status.tsx`), `role="status"`:
- Working: "Writing cards… 3 of 8 ready" with a thin progress bar (`role="progressbar"`, value/max).
- Connection trouble (3 failed checks in a row): "We're having trouble checking for new cards. Still trying…" (amber).
- Stopped (budget spent or 2 quiet minutes): "Stopped checking for new suggestions." + button "Check now" (restarts polling, resets counters).
Per-card text when stopped: "Still waiting. Use Check now above." Needs `useQuestionPolling` to accept a `restartToken` (5th, optional parameter, default 0, no change to current callers or `review-polling.test.tsx`).

**S6 Regeneration starting, running [P1].** Sees now: header text "Regenerating…" (same for starting and running), an empty group, the other header actions shifted. Fix (state content is mine, the trigger and confirm panel are plan 2): "Starting a new set of suggestions…" for starting; "Writing new suggestions with {model name}. This can take a few minutes." for running; both `aria-live="polite"`; the group shows the status as a banner row (new `review-regeneration-status.tsx`, delegated to by `review-regenerate.tsx`; plan 2 step 4 touches the same file, so land that first). After the poll budget: "This is taking longer than usual." + "Check now". Plan 1 should show 2 skeleton rows under the banner (note for plan 1, not planned here).

**S7 Regeneration failed [P0].** Sees now: red "Couldn't start. Try again." or "Couldn't regenerate. Try again." and Retry. Fix, two messages: start failed: "We couldn't start. Your current suggestions are untouched." + "Try again". Run failed: "Regenerating didn't finish. The earlier suggestions for this text were replaced, so there is nothing to review here yet." + "Try again" and "Try another model" (the second opens plan 2's confirm panel; if plan 2 is not ready, hide it). `role="alert"`.

**S8 Regeneration finished with nothing new [P1].** Sees now: the group silently disappears. Fix: a notice (see section 4 notices) "Regenerating finished but found nothing new to suggest from that text."

**S9 All cards in a text decided, not yet processed [P1].** Sees now: "5 of 5 reviewed" (same number twice), "Mark as processed" with no hint what it does. Fix: "All 5 suggestions reviewed" plus helper "Mark this text as processed to tidy it away. You can reopen it any time." While saving the button reads "Marking…". Race: if new cards arrive while the request runs, the code silently reopens the text (`review-processing.ts:50-51`); add a notice "New suggestions arrived for this text, so it stays open."

**S10 Processed section [P2].** Sees now: collapsed "Processed (N)" at the very bottom; a text vanishing into it gives no confirmation; each row's button is just "Reopen". Fix: notice "Moved to Processed (3)" when marking; give each button `aria-label="Reopen: {first 40 chars}"`; busy button text "Reopening…".

**S11 Source text header [P1 mobile].** Sees now: up to 2000 characters before the first card, no way to collapse, header actions wrap unpredictably on phones. Fix: show 3 lines with "Show full text" / "Hide" (button, `aria-expanded`), in `review-source-group.tsx`; header action cluster is plan 2's menu.

**S12 Manual draft being typed [P1].** Sees now: Front, Back, Example, Cancel. The card is created silently after both Front and Back have text; typing only Front does nothing visible; Cancel discards typed text without asking; after creation Cancel disappears; a failed create says "Couldn't add the card. Try again." with no way except retyping. Fix: helper under the fields "Fill in Front and Back. The card is saved automatically." (`aria-describedby`); after creation "Saved. Approve it when you're ready."; failed create: message "We couldn't save this card. Your text is kept." + "Try again" button (re-runs create); Cancel with text asks "Discard this card?" (inline Confirm/Keep). Over-limit line gets `role="alert"`.

**S13 Card with no questions yet [P1].** Sees now: pulsing dot "Writing cards…"; Approve greyed with no reason. Fix: Approve gets `aria-describedby` pointing at a visible hint "Waiting for the questions" (Approve text colour on the disabled style is also low contrast; use `disabled:text-neutral-600`).

**S14 Card being edited, saving, save failed [P0].** Sees now: tiny "Saving…/Saved/Could not save. Edit again to retry" (grey-400, `aria-live` only). Fix: status colour `text-neutral-600`, error `text-red-700` with `role="alert"` and a "Retry save" button (autosave hook returns a `retry()`), plus a visible reason next to the disabled Approve: "Save your changes first." / "Couldn't save your changes. Retry to approve." "Saved" fades after 3 s so it doesn't read as stale. (`review-autosave.ts`, `review-card-fields.tsx`.)

**S15 Card deciding (approve/reject in flight) [P1].** Sees now: buttons disabled, no spinner. Fix: pressed button shows "Approving…" / "Rejecting…", the card gets `aria-busy="true"`. Failure: "We couldn't approve this card. Your edits are kept. Try again." (`role="alert"` already). After success: a visually hidden announcer says "Approved. 3 suggestions left." / "Rejected. 3 left." and focus moves to the next card's first field (or to the status strip when none are left).

**S16 Decision strip [P0/P1].** Sees now: black bar fixed at the bottom, 10 s timer, "Approved. How good was this card?", rejection reasons, optional note, Undo (rejections only). Problems: (a) it never says which card; (b) errors ("Couldn't save the reason.", "Couldn't save the grade. Pick it again to retry.", "Couldn't save the note.", "Couldn't undo. Reload the page.") do not stop the auto-close; (c) approval note lost; (d) on phones it covers the last card and ignores the safe area; (e) whole strip is one `role="status"`, so a screen reader may re-read it; (f) 11px `text-white/50` hint. Fix: add `label` (first 60 characters of the card front) to `DecisionPrompt`, heading `Approved: "What happens before indexing?"`; in `review-decision-feedback.ts` stop the auto-close timer while `error !== null`; keep the typed approval note in the prompt and show the note box on an approved strip when `noteFailed`, with the error "Couldn't save your note. Click outside the box to try again."; add bottom padding on `main` while the strip is open and `pb-[env(safe-area-inset-bottom)]`; make only the heading `aria-live="polite"`, container `role="region" aria-label="Feedback on your last decision"`; hint at 12px `text-white/70`. Open question (product): approvals cannot be undone, a mis-pressed `a` is final. Not planned.

**S17 Bulk selection and confirm [P1].** Sees now: "Approve all ready (N)" button, Confirm replaces it in place (focus is lost), no in-flight feedback (the button returns at once), cards that are mid-edit are skipped silently, lists over 200 ids would be rejected by validation (`BULK_APPROVAL_MAX_IDS = 200`, listing limit not verified). Fix: focus the Confirm button when it appears and let Escape cancel; confirm text "Approve 12 suggestions? Cards you are still editing are left out."; while running the bar shows "Approving 12…" with the button disabled; compute and report cards left out because they were being edited; chunk requests by 200.

**S18 Bulk result [P0 bug, P1 tone].** Sees now: one neutral line under the bar that stays until the next bulk run. Fix: add `superseded` to the phrase table: "{n} replaced by a newer version"; message becomes `{ tone: 'success' | 'warning' | 'error', text }`; error uses `role="alert"`, says "We couldn't approve these. Nothing was changed, or only part was. Reload the list to check." with a "Reload list" button (calls refresh); messages move into the notices region and can be dismissed. Keep `data-testid="knowledge-bit-review-bulk-message"`.

**S19 Source-level reviewed-count / capped notes [P2].** "Showing the newest 5 of 12 fully reviewed texts." sits below the list; fine, but make it `text-neutral-600` and add "Older ones are in Processed after you mark them." only if true (verify) — otherwise leave.

**S20 Extraction grade (rate the text split) [P2].** Status "Saved" is `text-neutral-400` (contrast); failure says "Pick the grade again to retry" even when a note failed. Fix: contrast, a "Retry" button, copy "Couldn't save. Try again."

**S21 Extra affected points for other planners.** Plan 1: skeleton rows for S6; `data-focused` ring must stay, since the focus hook scrolls to `[data-focused="true"]` (currently there is no scrollIntoView, so `j`/`k` can move off screen). Plan 2: Regenerate trigger and Add new KI are greyed with a reason during S6/S7; "Approve all from this source" counts only cards with questions.

## 4. Approach (architecture)

No new data contract except S4's optional field. Business logic stays in the existing hooks; new files are small presentation pieces plus one hook for notices.
- New `review-notices.ts` (`useReviewNotices`: `push({tone,text})`, `dismiss`, `announce(text)`) and `review-notices.tsx` (one region at the top of the panel: success/warning `role="status"`, error `role="alert"`, dismiss button, 44px targets; a separate `sr-only` polite announcer). Replaces the one-off bulk message; used by S8, S9, S10, S15, S18.
- `review-live-status.tsx` reads: waiting count, ready count, `pollingGaveUp`, `idleStopped`, consecutive failures, `checkNow`.
- Terminology (one glossary, applied to all strings touched here): before approval "suggestion", after approval "card", source = "text". Replace "knowledge bits", "items", "KI" ("Add new KI" becomes "Add your own card", owned by plan 2's menu item label), "entry".
- Colour tokens: status text `text-neutral-600`, errors `text-red-700`, never `text-neutral-400` for words.

## 5. File split of `review-panel.tsx` (474 lines, behaviour unchanged)

Plan 1 step 1 already proposes the same first split (decisions and refresh). Land it once, whoever goes first; names below match it so the plans compose.
1. `review-refresh.ts` (`useReviewRefresh`, about 80 lines): `refreshQuestions`, `quietPolls`, `idleStopped`, the `useQuestionPolling` call, `handleEditingChange`. Receives `sources`, `setSources`, `knownBitIds`, `editingBitIds`, `rowErrors`, `regeneration`. Returns `pollingGaveUp`, `handleEditingChange`, later `checkNow`, `failureCount`.
2. `review-decisions.ts` (`useReviewDecisions`, about 150 lines): `saveDecisionNote`, `approve`, `reject`, the `useDecisionFeedback` wiring with its `update`/`undo` callbacks, `setRowError`, `rowErrors`.
3. `review-edits.ts` (`useReviewEdits`, about 90 lines; split from decisions only if decisions would pass 200 lines): `saveGrades`, `saveExtractionGrade`, `saveVariant`, `saveBit`, with `claimVariant/claimBitEdit` and `isVariantSaving/isBitSaving`.
4. `review-focus.ts` (`useReviewFocus`, about 80 lines): `focusedIndex`, `focusedBitId`, `activeIndex`, `focusedBit`, `moveFocus`, `handleKey`, `useReviewKeyboard`. Takes `approve`, `reject`, `bulk.requestApproveSource` as parameters.
5. Circular reference: `decisions` needs `processing.reopenIfProcessed` and `processing` needs `decision.dismiss`. Keep both declared in the panel in today's order and pass `onUndone: (sourceId) => processing.reopenIfProcessed(sourceId)` (a closure called later, as today).
6. Source group props (28 today): group into `cardActions` and `sourceActions` objects (plan 1 step 2 adds the same bundle type; reuse its type).
Result: panel about 170 lines (hook wiring plus JSX), every new file under 160.

## 6. Steps (ordered; each small)

1. Split per section 5, one hook per commit-sized step, running the 9 existing `review-panel.*.test.tsx` files after each; no assertions change.
2. `review-bulk-result.ts`: add `superseded` phrase; extend `review-bulk-result.test.ts`.
3. `review-decision-feedback.ts`, `review-decision-strip.tsx`, `review-decisions.ts`: label on prompt, pin on error, keep approval note and show the box on `noteFailed`. Update `review-panel.notes.test.tsx`, `...feedback.test.tsx`, `...decision.test.tsx`.
4. New `review-notices.ts(x)`; mount in the panel; move the bulk message into it (tone, dismiss, `role`); update `review-bulk-approval.ts`, `review-bulk-bar.tsx`.
5. `review-bulk-bar.tsx`, `review-bulk-confirm.tsx`, `review-bulk-approval.ts`: focus Confirm, Escape, in-flight text, skipped-for-editing count, chunking by 200.
6. `review-polling.ts` (`restartToken`), `review-refresh.ts` (failure count), new `review-live-status.tsx`; replace the old progress paragraph in the panel; update per-card stopped text in `review-variant-list.tsx`.
7. New `review-regeneration-status.tsx`; `review-regenerate.tsx` delegates for starting/running/failed (after plan 2 step 4); `review-regeneration.ts` keeps `modelId` and adds a `timedOut` flag; notice for finished-with-nothing.
8. `review-empty-state.tsx` + `review-empty-state.test.tsx`: three variants, props `hasProcessed`, `hasDecidedBefore`.
9. `review-reviewed-actions.tsx`, `review-processing.ts`, `review-processed-section.tsx`: S9, S10 copy, race notice, labels.
10. `review-draft-card.tsx`, `review-draft-save.ts`, `review-draft-list.tsx`: S12.
11. `review-autosave.ts` (`retry`), `review-card-fields.tsx`, `review-item.tsx`: S13, S14, S15 busy labels and announcer; focus-after-decision in `review-focus.ts`; scroll focused card into view.
12. `review-source-group.tsx`: collapsible source text. `review-extraction-grade.tsx`: S20.
13. New `review-loading.tsx`, `review-load-error.tsx`; wire `pendingComponent` and `errorComponent` in `apps/web/src/routes/knowledge-bit-review.tsx`.
14. Separate backend todo then web: S4 (`packages/shared/src/knowledge-bit.ts`, API list function, `review-extraction-status.tsx`, source-group stub).
15. Stories: add states to `apps/web/src/storybook/knowledge-bit-review/*.stories.tsx` (loading, extracting, failed, stopped polling, regeneration failed, save failed).

## 7. State matrix test plan (vitest + react-testing-library, `it('should ...')`, co-located)

Use `renderPanel` helpers and the shared `vi.mock('./knowledge-bit-review.api')` pattern already in each panel test; fake timers for polling. Query by role (`status`, `alert`, `progressbar`) so accessibility is asserted, not just text. No new test dependency (proposal, not decided: add an axe checker later; none exists today).

| State | File | Guarantee names |
|---|---|---|
| Loading, load error | `review-loading.test.tsx`, `review-load-error.test.tsx` | should tell the learner suggestions are loading; should offer Try again and a way home when the list cannot load |
| Empty variants | `review-empty-state.test.tsx` | should invite a first-time learner to add text; should say they are all caught up after deciding everything; should not claim everything is decided while a text is being read |
| Extracting / failed source | `review-extraction-status.test.tsx` | should show that a text is being read; should explain a failed extraction in plain words |
| Live status | `review-live-status.test.tsx`, `review-polling.test.tsx` | should show how many cards are ready out of all; should warn after three failed checks in a row; should offer Check now after polling stops and resume checking when pressed |
| Regeneration | `review-panel.regeneration.test.tsx` | should say the earlier suggestions were replaced when a run fails; should tell the learner when a run found nothing new; should offer Check now when a run takes longer than usual |
| Reviewed, processed | `review-panel.processing.test.tsx` | should say all suggestions are reviewed without repeating the number; should tell the learner when a text stays open because new cards arrived; should announce the move to Processed |
| Draft | `review-draft-card.test.tsx` | should explain that Front and Back are both needed; should keep the typed text and offer Try again when creating fails; should ask before discarding typed text |
| Card save states | `review-item.test.tsx`, `review-autosave` test | should explain why Approve is disabled while saving or after a failed save; should save again when Retry save is pressed |
| Deciding | `review-panel.test.tsx` | should show Approving while the request runs; should announce how many are left after a decision; should move focus to the next card |
| Decision strip | `review-panel.decision.test.tsx`, `...notes.test.tsx` | should say which card was approved; should stay open while an error is showing; should keep an approval note that could not be saved so it can be retried |
| Bulk | `review-bulk-result.test.ts`, `review-panel.bulk*.test.tsx` | should explain a card replaced by a newer version instead of reporting a failure; should say how many cards were left out because they are being edited; should show an alert and Reload list when bulk approve fails; should send at most 200 ids per request; should focus Confirm and cancel on Escape |
| Keyboard | `review-panel.bulk.test.tsx` | should keep the card moved to by j or k in view |

## 8. Done when

- Each state in section 3 shows the copy or behaviour above, and each has a test in section 7.
- No `text-neutral-400` text remains in the review components; errors use `role="alert"`, progress and notices use `role="status"`.
- No state disables a button without a visible reason; no failed save drops typed text.
- `review-panel.tsx` is under 300 lines (target about 170), every new file under 300, all existing review tests pass unchanged after step 1, then pass after their listed edits.
- `npx tsc --noEmit` and lint pass for `apps/web` (the `superseded` type gap is gone).
- At 375px width: no horizontal scroll, buttons at least 44px high, the strip does not hide the last card.

## 9. Defaults chosen

- Do the panel split first and identical to plan 1 step 1, so three planners do not edit one 474-line file.
- Polish and fix states in place rather than a new toast library: a small notices region fits the stack and needs no dependency.
- Interim empty-state wording instead of waiting for the backend field, so the wrong claim stops now.
- S4 backend change is its own todo with an optional field, so the web ships safely before and after it.
- "Suggestion" before approval, "card" after, "text" for a source: matches the page title and sidebar wording.
- Approvals stay non-undoable: a product decision, not a state fix.
- Reuse the nearest test fixtures (`apps/web/src/mocks/knowledge-bit-review.mock.ts`) and existing per-file `vi.mock` pattern; no shared mock refactor.

## 10. Facts, assumptions, to verify

- Facts (from code): `superseded` skip reason, missing phrase, empty-state text, strip 10 s timer (`DECISION_STRIP_VISIBLE_MS`), poll budgets (40 x 8 s, 200 x 3 s, idle 15 polls), `BULK_APPROVAL_MAX_IDS = 200`, no route pending/error components, no `scrollIntoView` in the folder.
- Assumptions: TanStack default error UI is unfriendly; contrast ratios computed from Tailwind's neutral palette; extraction `status` values.
- To verify: the pending-list `limit` against 200; whether older reviewed texts reach Processed (S19 line); whether the API change for S4 affects the sidebar pending count.

END-OF-REPORT
