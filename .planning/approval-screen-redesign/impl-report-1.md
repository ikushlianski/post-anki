# Approval screen redesign: implementation report 1

## What changed, in plain language

- A skipped "superseded" suggestion in a bulk approval now reads "N replaced by a newer version" instead of failing to type-check or showing nothing.
- The review panel was split into smaller parts (refresh, decisions, edits, focus, row state) with no behaviour change. The panel file is about 160 lines.
- Each source now has one "..." menu (compare models, regenerate, approve all ready, add your own card). It reuses the existing overflow menu with no new dependency. Approve, Reject and the feedback buttons stay visible on each suggestion. A menu item that cannot run is shown as unavailable with a reason, not hidden.
- Each source is now a real table on wide screens: one row per suggestion (front, back, quality, status badge, actions). Clicking a row opens it in place for editing. Editors stay mounted while closed, so an autosave is never dropped.
- Rows can be ticked (click or key x). A bar above the table approves only the ticked ones, after a confirm. "Select all" picks only the ready suggestions. Ticked rows are dropped from the selection when decided. Rows still being written or edited cannot be ticked.
- On phones the table becomes a stacked list with the same selection and actions.
- Keys: j/k move (the current row has aria-current), e opens or closes, x ticks. Keys are ignored inside menus and text boxes.
- Kept from earlier: Approve/Reject with feedback, "Couldn't save the note.", manual cards hide feedback buttons.

## Files

All paths are under apps/web/src. "kbr-" means knowledge-bit/knowledge-bit-review-.

- Superseded phrase: kbr-bulk-result.ts and its test.
- Panel split: kbr-panel.tsx, kbr-refresh.ts, kbr-edits.ts, kbr-decisions.ts, kbr-focus.ts.
- Actions menu: ui/actions-menu.tsx and test, ui/overflow-menu.tsx (trigger props added; this file also carries foreign edits), kbr-source-actions.ts, kbr-source-actions-menu.tsx, kbr-source-actions.test-utils.ts and tests, kbr-regenerate.tsx, kbr-bulk-confirm.tsx, kbr-draft-list.tsx, kbr-classes.ts, kbr-keyboard.ts and test, the add-item story.
- Table layout: kbr-row-types.ts, kbr-row-status.ts, kbr-status-badge.tsx, kbr-wide-screen.ts, kbr-row-state.ts, kbr-feedback-form.tsx, kbr-item-actions.tsx, kbr-row-parts.tsx, kbr-row-summary.tsx, kbr-compact-row.tsx, kbr-row-detail.tsx, kbr-table.tsx, kbr-item.tsx, kbr-variant-list.tsx, kbr-draft-card.tsx, kbr-selection-bar.tsx, kbr-bulk-approval.ts, kbr-source-group.tsx, kbr-bulk-bar.tsx, kbr-test-helpers.ts, the source-group story.
- New or rewritten tests: kbr-item.test.tsx, kbr-panel.table.test.tsx (8 tests: columns and row headers, approve only ticked after confirm, select-all only ready, clear selection, x/e keys, no keys while typing, aria-current, narrow stacked list), keyboard tests, row-state, row-status, status-badge, wide-screen tests. Existing panel and decision tests now open rows before editing.

Files that already had foreign uncommitted edits and that I left unstaged because I could not separate the edits: kbr-regeneration.ts, kbr-empty-state.tsx, kbr-sources.ts, kbr-sources.test.ts, kbr-panel.bulk-confirm.test.tsx, mocks/knowledge-bit-review.mock.ts, storybook kbr-item.stories.tsx. Nothing was committed. Staged only files I created or changed.

## Checks (apps/web)

- `npx tsc --noEmit`: no output, clean.
- `npx vitest run`: Test Files 194 passed (194), Tests 1329 passed (1329).
- `npx vitest run src/knowledge-bit src/ui`: 40 files, 352 tests passed before adding the table test; the table test then passed 8 of 8.
- Lint: no lint script exists in the root or apps/web package.json and there is no eslint, oxlint or biome config. Not run.
- Diff command: `git diff --cached -- apps/web/src` (staged set also includes foreign staged files from earlier work).
- Test files over 300 lines: kbr-panel.decision.test.tsx (688), kbr-panel.regeneration.test.tsx (409), kbr-panel.test.tsx (379); mostly existing, not split.

## Defaults taken

- Wide screen is the default when matchMedia is unavailable.
- Added "toggle-open" (e) and "toggle-select" (x) keys, as the plan implied.
- No visual or browser check was made (the rules forbid dev ports).

## Not done

Plan 3 state fixes after the superseded phrase were not implemented: S14 retry-save and approve-disabled reasons, S16 decision strip changes, S7/S8 regeneration messages and timedOut, S3 empty-state variants, S5 live status, S17 bulk focus/Escape/chunking by 200, S18 notices, S13/S15 hints, S9/S10 copy, S12 draft helper, S1/S2 route pending/error, contrast fixes, S11 collapsible source text, S20 extraction-grade retry, and the aria-live items. The table cell hover and column widths are unchecked in a real browser.

## Proposals (need a backend change or a new dependency)

- S4: backend extractionStatus and failureReason.
- Base UI Menu (@base-ui/react) for the actions menu.
- @tanstack/react-table.
- Model and source-snippet columns, alternatives rows.
- Bulk reject endpoint.
- An axe accessibility checker.
- Roving tab index for the table.

END-OF-REPORT
