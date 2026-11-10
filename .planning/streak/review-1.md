## Review: Show study streak count on the session summary screen

**Verdict: APPROVED**

### Contract checks

1. `getStudyStreak()` logic — PASS. Iterates daysAgo 1..365 counting consecutive non-zero days, breaks on first gap, then adds 1 if today (daysAgo=0) is non-zero. Correctly includes today and stops at a gap.

2. `studyStreak: getStudyStreak()` in SessionStats — PASS. Field declared in `SessionStats` interface and populated in `deriveSessionStats` return object in `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/web/src/knowledge-bit/anki-review-session-stats.ts`.

3. Summary shows "Streak: N days" when streak > 1 — PASS. `/Users/ikushlianski/webdata/ilya-projects/post-anki/apps/web/src/knowledge-bit/anki-review-summary.tsx` splices `['Streak', \`${stats.studyStreak} days\`]` at index 1 (after "Today") when `stats.studyStreak > 1`.

4. 8 tests — PASS. `npx vitest run` reports 8 passed, 0 failed.

### TypeScript

`npx tsc --noEmit` in apps/web produces no errors in the four changed files. All errors visible in output are pre-existing (model-comparison, storybook, unrelated routes).

### Resilience / infra-security

`getStudyStreak()` is wrapped in a try/catch returning 0 on any storage failure. `countForDaysAgo` also catches and returns 0. No external calls; no user-controlled input parsed unsafely (ISO date is constructed from `new Date()`, not user input).

### Findings

None.

END-OF-REPORT
