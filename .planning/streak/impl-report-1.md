## Study streak implementation

### Changes

- `apps/web/src/knowledge-bit/daily-review-storage.ts`: added `getStudyStreak()` with private helpers `keyForDaysAgo` and `countForDaysAgo`; counts backwards from yesterday up to 365 days, adds today if non-zero.
- `apps/web/src/knowledge-bit/anki-review-session-stats.ts`: added `studyStreak: number` to `SessionStats` interface; added `studyStreak: getStudyStreak()` to the return object.
- `apps/web/src/knowledge-bit/anki-review-summary.tsx`: inserts a "Streak: N days" row after "Today" when `stats.studyStreak > 1`; no emoji (none in file).
- `apps/web/src/knowledge-bit/daily-review-storage.test.ts`: added 3 tests for `getStudyStreak` covering zero, consecutive days, and gap stopping.

### Checks

Diff command: `git diff --cached -- apps/web/src/knowledge-bit/daily-review-storage.ts apps/web/src/knowledge-bit/anki-review-session-stats.ts apps/web/src/knowledge-bit/anki-review-summary.tsx apps/web/src/knowledge-bit/daily-review-storage.test.ts`

`npx tsc --noEmit` (apps/web): pre-existing errors only, none in changed files.

`npx vitest run src/knowledge-bit/daily-review-storage.test.ts` (from apps/web): 8 passed, 0 failed.

### Defaults

No emojis in `anki-review-summary.tsx` before this change, so plain text "Streak: N days" used.

END-OF-REPORT
