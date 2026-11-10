# Mac triage: hide the statement above the Q/A

Goal
- During triage on the desktop (Mac) app, the large statement line above the question/answer cards is not shown; only the Q/A cards (and example) remain.

Where
- `apps/ios/Sources/Shared/pending-review-triage-view.swift:34` — `Text(bit.body)` printed as a title above `cards(for:)`; this is the statement.
- `apps/ios/Sources/Shared/PendingReviewScreen+content.swift:133` — Mac-only branch that shows `PendingReviewTriageView`.
- iPhone triage uses `focus-triage-card.swift` (no statement line); leave it.

Scope
- In: drop the statement line in the Mac triage view only.
- Out: iPhone triage, `CardContextLine` (the small context line inside each card), edit sheet, review screens.

Done when
- `scripts/run-mac.sh --test` passes; Mac dev build shows triage with no statement above the Q/A cards.

Assumptions
- "Statement" = the knowledge piece's body (`bit.body`) shown as the title, not the per-card context line.
- The body stays visible in the editor and in copy actions.
