## Review: Show total due cards count on the Review nav link in the sidebar

### Contract checks

**1. `useReviewDueCount()` hook**

- Calls `getSubjectReviewDueCounts({})` once on mount via `useEffect` with empty deps array — confirmed at `apps/web/src/nav/sidebar.tsx:54`.
- Sums `data.subjects.reduce((acc, s) => acc + s.dueCount, 0) + data.unsorted.dueCount` — confirmed at `apps/web/src/nav/sidebar.tsx:55-57`.
- Returns `null` on loading (initial state) and on error (catch block `setCount(null)`) — confirmed at `apps/web/src/nav/sidebar.tsx:47,63`.
- PASS

**2. Review nav link label**

- `reviewDueCount !== null && reviewDueCount > 0 ? \`Review (${reviewDueCount} due)\` : 'Review'` — confirmed at `apps/web/src/nav/sidebar.tsx:105`.
- Shows plain "Review" for null (loading/error) and for 0; shows "Review (N due)" for N > 0.
- PASS

**3. Tests**

- `npx vitest run apps/web/src/nav/sidebar.test.tsx`: 3 passed, 0 failed.
- "should show Review with no count when zero due" — zero-due path confirmed.
- "should show Review (2 due) when two cards are due" — badge path confirmed, subject dueCount=2 summed correctly.
- "should link Suspended cards to its page directly after Review" — pre-existing approval test, unaffected.
- PASS

### Phase 3: Code quality

Tests: pass (3/3)
Type check: pass (zero errors in sidebar files; pre-existing errors in unrelated files remain unchanged)
Lint: not configured at apps/web level
Self-resolved: None
Needs your input: None

BAML tests: not applicable

### Phase 4: Performance and security

No new endpoints, no auth changes, no schema mutations, no sensitive data in logs. The hook catches all errors and degrades gracefully to null (plain label), no unhandled rejection path. No critical or high severity issues found.

### Phase 5: Business feature explainer

ELEMENT: Review nav link due count
Possible values:
  "Review": zero cards due, or data still loading, or fetch error
  "Review (N due)": N cards are currently due across all subjects plus unsorted
How it's calculated: One API call on sidebar mount sums the dueCount from each subject plus the unsorted bucket's dueCount and displays the total.
Edge cases:
  - API error or slow load shows plain "Review" (no stale count shown)
  - Unsorted cards with dueCount > 0 but no subject entries still produce a correct nonzero badge
  - Count is never refreshed after mount (no interval); stale if the user stays on the page

## Review
state: approved
reviewedBy: claude-sonnet-4-6 (effort: default)
Blocking issues: None
Divergences from plan: None

END-OF-REPORT
