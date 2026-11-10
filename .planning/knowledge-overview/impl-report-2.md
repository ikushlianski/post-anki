# Impl report 2 (units G and H, web side of /knowledge)

## Built
- /knowledge lists approved cards (question, answer, subject path, state and due), with a subject filter (SubjectCombobox, descendants included server side) and debounced search.
- Selection by keyboard and mouse, "Selected N" bar with Delete and Clear, permanent bulk delete behind a count-confirm alertdialog, per-row Suspend/Unsuspend via the existing updateCardSchedule.
- Move is not built (no button, no M key, no dialog). The key resolver returns a typed action union, so a move action is one new case.

## Files (apps/web/src)
- knowledge-bit/: knowledge-overview.api.ts (listKnowledgeOverview, deleteKnowledgeBits), knowledge-overview-selection.ts (anchor/cursor/base range, cap 200, prune, focus-after-removal), knowledge-overview-keyboard.ts (pure resolveOverviewKey, reuses isTypingTarget; ignores buttons and typing targets), knowledge-overview-result.ts, knowledge-overview-table.tsx (role=grid, aria-multiselectable, roving tabindex, Shift+click checkboxes), knowledge-overview-delete-dialog.tsx, knowledge-overview-page.tsx, knowledge-overview-screen.tsx, and hooks use-knowledge-overview-{data,selection,delete,subjects,row-actions}.ts
- routes/knowledge.index.tsx, routes/-knowledge.index.test.tsx, mocks/knowledge-overview.mock.ts
- nav/sidebar.tsx: one additive Link "All cards" (data-testid nav-knowledge-overview) before Review; nav/sidebar.test.tsx: one added test.
- routeTree.gen.ts: already contained the /knowledge/ route from the tool (vite plugin) once the route file existed. I re-ran @tanstack/router-generator to confirm the entry matches, then restored the file because that run drops the react-start Register block. Not hand-edited.
- Tests (co-located): selection, keyboard, result, delete-dialog, screen (keyboard-only flow: Shift+Arrow range, Delete, Enter; cancel focus return; next/previous/heading focus after delete; failure announced assertively; Ctrl+A; Escape; typing in search ignored; filters; suspend).

## Checks (from apps/web)
- npx tsc --noEmit: clean.
- npx vitest run: 215 files, 1470 tests passed.
- No lint script exists; none run.

## Defaults and notes
- Not staged: you said do not git add, and sidebar.tsx and routeTree.gen.ts carry foreign dirty hunks. New files are untracked.
- Dialog title uses singular for one card ("Delete 1 card permanently?").
- On a failed delete the dialog stays open with an inline error and an assertive announcement.
- After a successful bulk delete or suspend, the whole ['knowledge-bits'] query prefix is invalidated (also refreshes the suspended list).
- Plain arrow moves keep the Shift-range anchor; the anchor resets when nothing is selected. Delete/Backspace with nothing selected acts on the focused row.
- Suspend button is tabbable only in the current roving row.
- Not touched: apps/api, packages/shared. Browser check on the e2e stack not run.

END-OF-REPORT
