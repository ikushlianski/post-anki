# Review: Home due-today card (item 6)

Verdict: APPROVED

Scope read: DueTodayCard.swift (new, whole file) and the working-tree diff of HomeScreen.swift (our three insertions only: dueModel state, first Section with DueTodayRow, refreshable loading both models). The other orchestrator's staged "Add knowledge" changes are untouched. Build with own derived data: exit 0.

## Contract check
- Count source is GET /knowledge-bits/review-cards?limit=1&tz=<device zone> using the shared APIClient.reviewCards, total = review + learning + new. Fact: these counts come from the same eligible set the Due screen serves, with new cards capped by the daily allowance (apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:106-110). The subject due-counts endpoint was rejected because its subtree roll-up double-counts nested subjects (subject-review-due-counts.repo.ts:66-84).
- Row is a NavigationLink to DueReviewScreen(); HomeView.swift untouched.

## Behaviour
- Reloads on every Home appearance (row .task) and on pull-to-refresh; a loading guard drops overlapping loads.
- Failed refresh keeps the last counts; with no counts it shows offline / Settings / generic text. 401 is shown, not swallowed. Nothing is logged.

## Findings
- Low — Grades queued offline are not yet reflected until they are sent, so the number can be briefly high. Item 5 adds a queue flush before the count load.

No Critical/High/Medium findings.

END-OF-REPORT
