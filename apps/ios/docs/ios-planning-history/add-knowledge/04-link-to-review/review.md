# Review: item 4 link to review (Opus orchestrator)

Verdict: APPROVED

Checked: IngestionDictationScreen.swift whole against plan.md. Only that file changed for this item. Review screen opens as a sheet, not a pushed NavigationLink, because PendingReviewScreen wraps its own NavigationStack (PendingReviewScreen.swift:10); pushing it would nest stacks. The link appears only after the source is saved, stays disabled until detect-bits returns, and a failed send shows no link. @MainActor model, no force unwraps, no token logging. Build exit 0 (own derived data).

## Findings
- Low: the sheet has no Done button, only the drag indicator. Mechanism: PendingReviewScreen is owned by another orchestrator and has no dismiss control. Fix: add a toolbar Done there, or wrap in a container with one. Not fixed (swipe-down works).
- Low (carried from item 1-2): Submit and the review link wait for detect-bits; on a slow extraction the user waits before both enable.

END-OF-REPORT
