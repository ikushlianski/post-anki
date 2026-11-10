## impl-report-1: Show total due cards count on Review nav link

### What was done

`sidebar.tsx` already contained the `useReviewDueCount` hook and the dynamic label — both were present from a previous session. The only change required was fixing the TypeScript errors in `sidebar.test.tsx`: the mock payload for the "2 due" test was missing `newCount` on the subject entry and `newCount`/`newRemainingToday` on the unsorted/root object.

### Files changed

- `apps/web/src/nav/sidebar.test.tsx` — added `newCount: 0` to the subject in the mock, `newCount: 0` to `unsorted`, and `newRemainingToday: 3` to match the `SubjectReviewDueCounts` shape.

### Check results

- `npx tsc --noEmit` (scoped to sidebar): zero errors (pre-existing errors in unrelated files remain).
- `npx vitest run apps/web/src/nav/sidebar.test.tsx`: 3 passed, 0 failed.
- No lint script defined at repo root or apps/web level.

### Default taken

Added `newRemainingToday: 3` to the "2 due" mock (value matches the brief's example).

END-OF-REPORT
