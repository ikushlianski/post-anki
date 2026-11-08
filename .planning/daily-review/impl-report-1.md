# Impl report: persist per-day review totals

## What was built

- `apps/web/src/knowledge-bit/daily-review-storage.ts` — new module with `getDailyReviewCount()` and `incrementDailyReviewCount()`. Reads and writes `localStorage` under key `review-count-<yyyy-mm-dd>`. Both functions have try/catch so they never throw into React renders.

- `apps/web/src/knowledge-bit/anki-review-session-actions.ts` — imports `incrementDailyReviewCount` and calls it immediately after a confirmed grade (after `pendingGrade.current = null`, before `moveOnAfter`).

- `apps/web/src/knowledge-bit/anki-review-session-stats.ts` — imports `getDailyReviewCount` and returns `totalGradedToday: getDailyReviewCount()` as a new field on `SessionStats`.

- `apps/web/src/knowledge-bit/anki-review-summary.tsx` — adds a "Today" row at the top of the summary table using `stats.totalGradedToday`.

- `apps/web/src/knowledge-bit/daily-review-storage.test.ts` — 5 tests: returns 0 with no entry, returns 0 for unparseable value, increments from 0 to 1, increments correctly on repeated calls, a past-day key leaves today at 0.

## Checks

- `npx tsc --noEmit` (apps/web): no errors in any of the 5 touched files; pre-existing errors in `model-comparison/`, `admin-settings/`, and `knowledge-bit-review-*` unrelated files remain unchanged.
- `npx vitest run src/knowledge-bit/daily-review-storage.test.ts` (from apps/web): 5 passed, 0 failed.
- `npx vitest run` (apps/web full suite): 9 failed | 177 passed — the 9 failing test files are pre-existing failures confirmed by reverting only my 3 modified tracked files and re-running (same failures, same count).

## Defaults

- `getDailyReviewCount()` is called directly inside `deriveSessionStats` rather than passed as a parameter, matching how the existing pure function already accepts mutable external state (tally stamp, counts). The stats test still passes because jsdom provides `localStorage`.
- "Today: N" is shown as the first row in the session summary table, before "Cards reviewed", to give it the most prominent position.

END-OF-REPORT
