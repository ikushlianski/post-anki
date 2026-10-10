# UX usability review: first flow (paste, approve, review, navigate)

Basis: code reading only. Every issue cites the component that renders it. Visual, touch, contrast and live-behaviour judgments are marked **unverified** because no browser was used.

## Verdict

1. The flow works in code, but a first-time user gets no explanation of what "approve" does or how long questions take.
2. Two screens are both called "review", and the nav lists the steps in reverse order (Add knowledge is last).
3. Failures are silent on the approval screen: a failed approve or reject leaves the row with no message.
4. The Anki screen shows "Done for today" even when the user has reviewed nothing, and its controls use unexplained glyphs (`-`, `@`, `E`, `Z`).
5. Keyboard hints are the only guidance for shortcuts and are hidden on touch devices; several controls have weak labels or low-contrast text.

## Screen 1: /add-knowledge (paste text)

Files: `apps/web/src/routes/add-knowledge.tsx`, `apps/web/src/knowledge-source/add-knowledge-form.tsx`

1. **Impact high. Purpose is unclear.** The page subtitle says "each becomes its own knowledge source for the detector to work through" (`apps/web/src/routes/add-knowledge.tsx:14-16`). The user sees jargon ("knowledge source", "detector") and is not told that suggestions appear later for approval.
   Fix: Replace the subtitle with "Paste text. We'll draft questions you can approve on the next screen."
2. **Impact high. Waiting with no feedback.** While saving, the submit button still reads "Add knowledge" and only dims (`add-knowledge-form.tsx:210-216`). No spinner or "Saving…" text appears.
   Fix: Change the label to "Adding…" while `busy` is true.
3. **Impact medium. Success does not set expectations.** The success text is "Knowledge source added." (`add-knowledge-form.tsx:112-114`). The user is not told that questions take minutes to generate, so the approval screen looks empty.
   Fix: Say "Added. Questions usually take a minute or two to appear for review."
4. **Impact medium. Partial failure is not specific.** On partial failure, only the failed blocks stay on screen, but the message is generic and names no block (`add-knowledge-form.tsx:117-119`, `:124`).
   Fix: Name the block number in the error ("Block 2 could not be added. Try again.").
5. **Impact medium. Mode toggles are unclear.** "Paste text" and "Add link" are plain buttons that change colour only. They expose no pressed state (`add-knowledge-form.tsx:135-160`).
   Fix: Add `aria-pressed` to both toggles and make them a segmented control.
6. **Impact low. Accessibility of inputs.** The textarea and URL input have a placeholder but no label (`add-knowledge-form.tsx:163-183`).
   Fix: Add an `aria-label` such as "Text to learn from" or "Article link" to each input.
7. **Impact low. Remove control is ambiguous.** "Remove" appears under every block except the first and is repeated without context (`add-knowledge-form.tsx:185-195`).
   Fix: Label it "Remove block 2" or add an `aria-label` with the block number.
8. **Unverified.** Mobile wrapping of the toggle row and the "+ Add another block" / submit row at 375px width.

## Screen 2: /knowledge-bit-review (approve suggestions)

Files: `apps/web/src/routes/knowledge-bit-review.tsx`, `apps/web/src/knowledge-bit/knowledge-bit-review-panel.tsx`, `knowledge-bit-review-item.tsx`, `knowledge-bit-review-keyboard.ts`, `knowledge-bit-review-polling.ts`

1. **Impact high. Failures are silent.** If approve or reject fails, the row stays with no message. The comment says "Row stays listed on failure so the decision can be retried" (`knowledge-bit-review-panel.tsx:80-82`, `:134-136`), but the user is never told it failed.
   Fix: Show a per-row error line "Couldn't approve. Try again." on failure.
2. **Impact high. Jargon and unclear next step.** The title "Knowledge bit review" and the subtitle "before they become visible to learners" do not say what approving does (`apps/web/src/routes/knowledge-bit-review.tsx:17-20`). The approve button gives no hint that cards are generated afterwards.
   Fix: Retitle to "Approve suggested questions" and explain "Approved questions go into your review queue."
3. **Impact high. "Checking automatically" is a false promise.** The no-variants text says "Waiting for questions — checking automatically" (`knowledge-bit-review-item.tsx:202-204`). Polling stops after 40 attempts at 8 seconds (`knowledge-bit-review-polling.ts:4-5`, `:49-52`), so after about 5 minutes the text is still shown and nothing updates.
   Fix: After polling stops, show "Still waiting. Reload the page to check again."
4. **Impact high. Disabled Approve has no reason.** Approve is disabled with no variants (`knowledge-bit-review-item.tsx:123`) and while an editor is open (`:122`). Neither state explains why.
   Fix: Add a visible reason line or `title` text next to a disabled Approve.
5. **Impact medium. Empty state is a dead end.** "No pending knowledge bits." offers no next step (`knowledge-bit-review-panel.tsx:240-243`).
   Fix: Add a link "Add knowledge to get new suggestions" to `/add-knowledge`.
6. **Impact medium. Bulk result is vague.** "Approved 3, skipped 2 that could not be approved." gives no reason, and the message is not announced to screen readers (`knowledge-bit-review-panel.tsx:112-116`, `:234-238`).
   Fix: Add `role="status"` and a short reason for skipped items.
7. **Impact medium. Keyboard hint is hidden on touch.** The key legend appears only when there is at least one approvable bit, and only as low-contrast text (`knowledge-bit-review-panel.tsx:218-230`). j/k moves focus but has no touch equivalent.
   Fix: Show the key legend only on pointer-fine devices, and mark it as keyboard-only.
8. **Impact medium. Approve and reject have no undo.** Approving or rejecting removes the row immediately (`knowledge-bit-review-panel.tsx:78`, `:132`).
   Fix: Show a 5-second "Undo" toast after each approve or reject.
9. **Impact medium. "Approve all ready (N)" is one click with no confirmation.** It approves every ready bit on the screen (`knowledge-bit-review-panel.tsx:220-227`).
   Fix: Confirm with "Approve N questions?" when N is greater than 5.
10. **Impact medium. Two different counts both say "Approve".** The sidebar badge counts curricula awaiting approval (`apps/web/src/nav/sidebar.tsx:98-100`) while the nav link counts suggestions (`:70`). The dashboard badge is a different concept with the same wording.
    Fix: Rename one count so the two meanings do not overlap.
11. **Impact low. Labels are generic.** "Edit" and "Edit text" do not say what is edited (`knowledge-bit-review-item.tsx:190-196`, `:267-273`). Textareas and inputs in the editors have no labels (`:141-153`, `:210-223`).
    Fix: Use "Edit question 1" style labels and `aria-label`s on every editor field.
12. **Impact low. Editor has no Escape or save shortcut.** The Anki editor handles Escape and Ctrl+Enter (`apps/web/src/knowledge-bit/anki-review-card-editor.tsx:22-30`), but this editor does not.
    Fix: Match the Anki editor: Escape cancels, Ctrl+Enter saves.
13. **Impact low. Contrast.** "Waiting…" and the key hints use `text-neutral-400` (`knowledge-bit-review-item.tsx:202`, `knowledge-bit-review-panel.tsx:229`). That is about 2.5:1 on white, below the 4.5:1 AA threshold for small text.
    Fix: Use `text-neutral-500` or darker for all helper text.
14. **Unverified.** Touch target size. Buttons use `text-xs` with `py-1` (`knowledge-bit-review-item.tsx:224-298`), which is likely under 44px tall. Also unverified: focus scrolling when j/k moves between items.

## Screen 3: /knowledge/review (Anki-style review)

Files: `apps/web/src/routes/knowledge.review.tsx`, `apps/web/src/knowledge-bit/anki-review-*.tsx` and `.ts`

1. **Impact high. "Done for today" shows when nothing was reviewed.** If the queue is empty at the start, the done screen renders anyway (`apps/web/src/knowledge-bit/anki-review-screen.tsx:177-182`, `anki-review-done.tsx:4`).
   Fix: Show "No cards are due right now" with a link to approve suggestions when the session has zero reviews.
2. **Impact high. Grade focus is lost.** Grade buttons unmount when the next card loads (`anki-review-screen.tsx:217-223`), so keyboard focus drops to the page top. Unverified in a browser.
   Fix: Move focus to the "Show answer" button after each grade.
3. **Impact high. Bury and Suspend are unexplained glyphs.** The labels read "Bury -" and "Suspend @", and they sit above the question, before the user has read it (`anki-review-card-actions.tsx:30-41`, `anki-review-card.tsx:21`).
   Fix: Move the actions below the answer and label them "Hide until tomorrow" and "Remove from reviews".
4. **Impact high. Grade buttons do not say what they mean.** Each button shows interval, name and key, and no `aria-label` joins them (`anki-review-grade-buttons.tsx:24-40`). A screen reader hears "10d Good 3".
   Fix: Add `aria-label="Good, next review in 10 days"` to each grade button.
5. **Impact medium. Session bar is cryptic.** "N done · M left" has no unit (`anki-review-session-bar.tsx:18-20`), and "End session" is disabled at zero with no reason (`:30-38`).
   Fix: Say "3 reviewed · 7 left to do" and add a tooltip when End session is disabled.
6. **Impact medium. Counts use unexplained terms.** "New", "Learning" and "Due" appear with no legend (`anki-review-counts.tsx:3-7`).
   Fix: Add a `title` on each count explaining it in plain words.
7. **Impact medium. Summary is dense.** Thirteen rows include "Leeches flagged", "Recalled" and "Buried", with no explanation (`anki-review-summary.tsx:12-26`). It also repeats under the done screen (`anki-review-screen.tsx:180`).
   Fix: Show four headline numbers and hide the rest behind "More details".
8. **Impact medium. Done screen has no next step.** The done screen says "No more cards are scheduled." and offers no action (`anki-review-done.tsx:6-8`).
   Fix: Add a button to approve suggestions or add knowledge.
9. **Impact medium. Grade error has no retry.** For retryable errors, the message "Couldn't save that. Try again." appears with no button (`anki-review-session-actions.ts:22-27`, `anki-review-screen.tsx:225-239`).
   Fix: Add a Retry button for retryable grade errors.
10. **Impact medium. Keystrokes are dropped silently.** Keys are ignored while busy or editing (`anki-review-keyboard.ts:40`), with no feedback.
    Fix: Show a brief "Saving…" state on the grade row while busy.
11. **Impact medium. Notices are not announced.** The notice and leech text are plain paragraphs (`anki-review-screen.tsx:167-171`, `anki-review-card-actions.tsx:20-24`).
    Fix: Add `role="status"` to the notice region and the leech label.
12. **Impact medium. Mobile layout risk.** The session bar is a single non-wrapping flex row with progress, Undo and End session (`anki-review-session-bar.tsx:17`). The header puts the title and "Switch to typed answer" side by side (`anki-review-screen.tsx:120-135`).
    Fix: Add `flex-wrap` to the session bar and stack the header on narrow screens.
13. **Impact low. Keyboard hints are the only shortcut guidance.** "Space", "E", "Z", "1-4" appear only as small kbd labels (`anki-review-card.tsx:36`, `anki-review-grade-buttons.tsx:39`), and touch users have no shortcut path.
    Fix: Hide kbd hints on touch and keep them for pointer-fine devices.
14. **Impact low. Editor labels are fine, but cancel is silent.** Escape cancels with no feedback (`anki-review-card-editor.tsx:22-25`).
    Fix: Keep Escape, and add "Edit discarded" as a notice.
15. **Impact low. Load states are plain text.** "Loading…" appears twice with no spinner or region role (`anki-review-screen.tsx:137`, `:153`).
    Fix: Use one `role="status"` loading message.
16. **Unverified.** The background and chat panel that opens after reveal (`anki-review-card.tsx:52`) may add scrolling and visual weight on mobile. Its content was not read.
17. **Unverified.** Contrast of kbd hints (`text-neutral-400` in `anki-review-grade-buttons.tsx:39`).

## Screen 4: Navigation (sidebar)

File: `apps/web/src/nav/sidebar.tsx` (desktop and mobile drawer mount in `apps/web/src/routes/__root.tsx:109-123`)

1. **Impact high. Nav order is backwards.** The flow is Add, Approve, Review, but the nav lists Dashboard, Review, Answer (typed), Approve suggestions, Add knowledge (`sidebar.tsx:53-74`).
   Fix: Reorder the nav to Add knowledge, Approve suggestions, Review.
2. **Impact high. Two pages called "Review".** "Review" (`sidebar.tsx:59-61`) is the card session, and "Approve suggestions" leads to the page titled "Knowledge bit review" (`knowledge-bit-review.tsx:17`). The names collide.
   Fix: Rename the approval page "Approve suggestions" in its heading, and keep "Review" for cards.
3. **Impact medium. "Answer (typed)" is an unexplained mode.** It is a second review mode with no hint of what it is (`sidebar.tsx:62-64`).
   Fix: Move it under Review as "Type answers instead".
4. **Impact medium. Badge count is stale for up to a minute.** The count refreshes every 60 seconds and on events (`sidebar.tsx:9`, `:31-33`).
   Fix: Refresh the count on window focus as well.
5. **Impact low. Mobile drawer.** The drawer opens from the toggle (`__root.tsx:84-86`, `:119-123`). Whether it closes after navigation was not read.
   Fix: Close the drawer on each link click.
6. **Unverified.** Active-state styling is class-based (`sidebar.tsx:45-46`). Whether the current page is announced to screen readers was not checked.

## Top 8 fixes (todo-ready)

1. Explain approve, and that questions take minutes, on paste.
2. Show per-row error when approve or reject fails.
3. Stop "checking automatically" text after polling gives up.
4. Reorder nav: Add, Approve, Review.
5. Rename approval page so "Review" means cards only.
6. Fix "Done for today" showing when nothing was reviewed.
7. Label Bury and Suspend in words; move below answer.
8. Add aria-labels with interval to grade buttons.

END-OF-REPORT
