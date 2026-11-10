# Approval screen redesign: implementation report 2

## What changed, in plain language

- A card edit that fails to save now shows a red alert with a "Retry save" button. Your typed text stays. The row opens itself so the error is seen. Next to the greyed-out Approve there is now a visible reason: "Save your changes first.", "Couldn't save your changes. Retry to approve." or "Waiting for the questions". The "Saved" label disappears after 3 seconds.
- The feedback strip after a decision names the card ("Approved: ..."). It no longer closes by itself while an error is showing. A failed approval note is kept: the note box appears on the approved strip and a blur retries it. The strip is a labelled region, only its heading is read aloud, the hint text is larger and lighter-contrast-safe, and the page gets bottom space while the strip is open.
- Regeneration: starting and running have separate wording; a failed start says the current suggestions are untouched; a failed run says the earlier suggestions were replaced and offers "Try again" and "Try another model"; a run that finishes with nothing shows a dismissible notice; a run that outlasts the polling budget says it is taking longer than usual.
- Empty page: three honest wordings ("Nothing to approve yet." for a new learner, "You're all caught up." after deciding or processing everything), the "keeps checking for a couple of minutes" line, "Study approved cards" instead of a bare "Review", and a "Check now" button. It no longer claims "Everything is decided" to someone who has not added anything.
- Live status strip at the top: "Writing cards... 3 of 8 ready" with a progress bar, announced politely; an amber "trouble checking" message after 3 failed checks in a row; "Stopped checking for new suggestions." with a "Check now" button when polling gave up or the page was quiet (Check now restarts the checking and looks immediately). Per-card text when stopped now says "Use Check now above."
- Bulk approval: Escape cancels the confirmation (focus stays on Cancel, the safer button); the question reads "Approve N suggestions? Cards you are still editing are left out."; while it runs the button reads "Approving N..." and is disabled; requests are split into groups of 200; the result mentions how many were left out because they were being edited; a failure is an alert with a "Reload list" button.
- Copy and hints: "All N suggestions reviewed" with a helper line for "Mark as processed" and a "Marking..." state; a "Moved to Processed." notice and a "New suggestions arrived for this text, so it stays open." notice; Reopen buttons carry the text name and read "Reopening..."; the "Splitting" rating retry reads "Couldn't save. Try again." with a Retry button.
- Contrast: status text, labels, placeholders, disabled button text, page subtitle and processed-section notes moved off the faint greys; errors use red-700.
- Long source text shows 3 lines with "Show full text" / "Hide" (only when over 240 characters).

## Files (all under apps/web/src/knowledge-bit, "kbr-" = knowledge-bit-review-)

- New: kbr-live-status.tsx, kbr-notice.tsx, kbr-source-text.tsx, kbr-approve-reason.ts, and tests kbr-live-status.test.tsx, kbr-approve-reason.test.ts, kbr-item.save-failure.test.tsx, kbr-decision-feedback.test.tsx, kbr-reviewed-actions.test.tsx, kbr-panel.states.test.tsx (11 tests: bulk, regeneration, check now, source text).
- Changed: kbr-autosave.ts (retry hook, old hook kept for other callers), kbr-card-fields.tsx, kbr-variant-list.tsx, kbr-row-detail.tsx, kbr-item.tsx, kbr-item-actions.tsx, kbr-row-parts.tsx, kbr-row-types.ts, kbr-polling.ts (restartToken), kbr-refresh.ts, kbr-panel.tsx, kbr-bulk-approval.ts, kbr-bulk-bar.tsx, kbr-bulk-confirm.tsx, kbr-decision-feedback.ts, kbr-decisions.ts, kbr-decision-strip.tsx, kbr-regenerate.tsx, kbr-source-group.tsx, kbr-reviewed-actions.tsx, kbr-processed-section.tsx, kbr-processing.ts, kbr-extraction-grade.tsx, kbr-classes.ts, kbr-page.tsx, kbr-empty-state.test.tsx (rewritten).
- Existing panel tests updated for the new wording: bulk, table, decision, feedback, manual, processing, regeneration, panel, extraction-grade.
- Changed but NOT staged because they already carried someone else's uncommitted edits: kbr-empty-state.tsx (rewritten, the old edit was only a link size class) and kbr-regeneration.ts (messages, notice, nothing-new detection).
- Diff command: `git diff --cached -- apps/web/src/knowledge-bit` plus `git diff -- apps/web/src/knowledge-bit/knowledge-bit-review-empty-state.tsx apps/web/src/knowledge-bit/knowledge-bit-review-regeneration.ts` for the two unstaged files. The staged set also contains earlier staged work.

## Checks (apps/web)

- `npx tsc --noEmit`: no output, exit 0.
- `npx vitest run`: Test Files 200 passed (200), Tests 1361 passed (1361).
- Lint: no lint script or lint config exists (same as report 1), not run.

## Defaults taken

- Confirm keeps focus on Cancel (the safer button) rather than moving it to Confirm.
- The running-regeneration message omits the model name (no ready label lookup in the hook); wording is "Writing new suggestions. This can take a few minutes."
- "Stopped checking" appears for both a spent budget and 2 quiet minutes, even when all cards are ready.
- "Moved to Processed." has no count.
- Source text collapses by a length threshold (240 characters), not by measuring lines.
- The old "Could not save" start of the autosave error text is kept ("Could not save your changes.").

## Not done

- S1/S2 route pending and error screens (outside the requested list).
- S15 "Approving..." labels, aria-busy, the spoken "N left" announcer and focus moving to the next card after a decision.
- S12 manual draft helper text, discard confirmation and create retry.
- S6 skeleton rows; S9 sources of S19 note tweaks; the "text-neutral-400" pulsing dot in the waiting notice (decorative, left).
- Items needing a backend change or new dependency (S4, Base UI, tanstack, alternatives, bulk reject, axe), skipped as instructed.
- No browser check (rules forbid dev ports); the strip padding, safe-area and 3-line clamp are unchecked visually.
- Test files over 300 lines from report 1 are unchanged.

END-OF-REPORT
