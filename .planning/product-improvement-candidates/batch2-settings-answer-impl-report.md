# Batch 2 impl report: settings save failures, typed-answer skip and keyboard submit

Evidence in report-2.md items 2 and 6 was checked against the code before building; all cited lines matched.

## Item 2: Settings show a clear message when a save fails and never lock the page

Files
- apps/web/src/routes/admin-settings.tsx (one `save` helper with try/catch/finally for all four saves; per-control error line; placement panel and board loaded with `settle`)
- apps/web/src/admin-settings/new-cards-per-day-field.tsx (draft returns to the last saved value when the save fails)
- apps/web/src/routes/-admin-settings.test.tsx (new)
- apps/web/src/admin-settings/new-cards-per-day-field.test.tsx (one case added)

Behavior
- A failed save shows "Could not save, try again." next to the control that failed, re-enables every control, and leaves the last saved value visible (the new-cards box reverts to it).
- If placement suggestions or the board fail to load, the settings still load and the placement section shows a short error note only.

Tests (from apps/web)
- `npx vitest run src/routes/-knowledge.answer.test.tsx src/routes/-admin-settings.test.tsx src/admin-settings`: 5 files, 34 tests passed, 0 failed (new: 2 page tests, 1 field test).

tsc: `npx tsc --noEmit` in apps/web, 0 errors.

Defaults chosen
- Error text is a plain line, not a toast. The model and toggle controls are already controlled by the saved value, so they revert on their own.
- The placement section note says "Reload to try again" rather than adding a retry button.

Undone: none. The model and tier selects have no dedicated failure test; they share the same `save` path, covered through the new-cards case.

Citation: apps/web/src/routes/admin-settings.tsx:36-52 (save helper that always clears busy and sets the failed field).

## Item 6: Skip a typed question and submit with Ctrl/Cmd+Enter

Files
- apps/web/src/routes/knowledge.answer.tsx
- apps/web/src/routes/-knowledge.answer.test.tsx (3 cases added)

Behavior
- "Skip for now" sits beside Submit before any grading, moves to the next question, and does not call grading or record anything.
- Ctrl+Enter or Cmd+Enter in the answer box submits; plain Enter still adds a new line.
- A ref guards `submit`, so repeated keypresses while a grade is pending send one request. Skip is disabled while grading.
- The existing Try again and Skip-on-failure flows are unchanged.

Tests: same run as above (included in the 34 passed).

tsc: same run as above, 0 errors.

Defaults chosen: the Skip control is a quiet text button; no confirmation step.

Undone: none.

Citation: apps/web/src/routes/knowledge.answer.tsx:72-95 (submit guard) and the answer-screen-skip button in the same file.

END-OF-REPORT
