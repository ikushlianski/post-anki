# Impl report: sidebar review count stays current

## Evidence check
Verified in code: effect ran once with `[]` deps, called `getSubjectReviewDueCounts({})` without tz, and the catch set counts to null. Note: the old call `({})` meant no tz. Also verified that grade, bury/suspend and undo in the review session never fired `PENDING_REVIEW_CHANGED_EVENT` (only approve flows did), so the event alone would not have covered them.

## Files changed
- apps/web/src/nav/sidebar.tsx: passes `browserTimeZone()`, reloads on `PENDING_REVIEW_CHANGED_EVENT`, keeps last counts on failed refresh.
- apps/web/src/knowledge-bit/anki-review-session-actions.ts: fires `notifyPendingReviewChanged()` after successful grade, suspend/bury, and undo.
- apps/web/src/nav/sidebar.test.tsx: 3 new tests (tz passed, reload on event, last counts kept on failure).

## Behavior
Sidebar "Review (N due · M new)" uses the learner's local day, and refreshes after grade, undo, bury, suspend or approve. A failed refresh leaves the previous label.

## Tests
- `cd apps/web && npx vitest run src/nav src/knowledge-bit/anki-review`: 8 files, 54 passed, 0 failed.

## tsc
- apps/web `npx tsc --noEmit`: no errors.

## Defaults
- Reused the existing event (no new event) and the existing `browserTimeZone` helper.
- Kept the 60s polling off for review counts (event-driven only).

## Undone
- No dedicated test asserting the session actions dispatch the event (covered indirectly; existing tests pass). API unchanged.

## Citation
apps/web/src/nav/sidebar.tsx:60 (tz passed) with listener at apps/web/src/nav/sidebar.tsx:76

END-OF-REPORT
