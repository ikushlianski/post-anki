# Review 01: Review tab list

Verdict: APPROVED

Checked against plan.md and the server contract: `knowledge-bit-approval.controller.ts:14-20` returns a bare array of sources, and the models decode it with no date fields. The view model is `@MainActor`, the models are `Sendable` value types, there are no force unwraps, and the token is not touched. The Review tab was added after Inbox in HomeView.swift, and that edit is surgical. My own build exited 0.

## Findings

### Low
- Symptom: on the very first frame, before `.task` starts, an empty list flashes for a moment. Mechanism: the view only shows the spinner when `!hasLoaded && isLoading`, and `isLoading` is still false before the first load begins. Fix: also show the spinner when `!hasLoaded && errorMessage == nil`.
- Symptom: the badge count can exceed the number of items shown, because the list is capped at 200. Mechanism: `PENDING_REVIEW_LIST_LIMIT` is 200 on the server. Fix: none needed now. A later item could add a "showing first 200" hint.

END-OF-REPORT
