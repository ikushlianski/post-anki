# Review 04+05: Approve all per source, undo a reject

Verdict: APPROVED

Checked against plan.md and the server. The bulk approve body `{knowledgeBitIds}` is sent in chunks of up to 200, and the reply `{approved, skipped[{id, reason}]}` matches `knowledge-bit-bulk-approval.controller.ts:9-22` and `packages/shared/src/knowledge-bit.ts:110-128`. Restore's `{ok:true}` decodes into `EmptyResponse`, and a 404 maps to "already changed", matching `knowledge-bit-feedback.controller.ts:33-46`. Double-tap guards: "Approve all" goes through a confirmation and is guarded per source (`bulkInFlight`) and per item (`inFlight`). Undo is guarded by `isRestoring`. The undo timer is a cancellable main-actor `Task` that holds `[weak self]` and re-checks the id and whether a restore is running before it dismisses. Offline, unauthorized and 404 cases are mapped. The swipe Reject no longer uses `role: .destructive`. There are no force unwraps and the token is never logged. My build exited 0.

## Findings

### Low
- Symptom: while "Approve all" is running, the button reads "Approve all (0)". Mechanism: `readyCount` leaves out in-flight items, and those are exactly the ones being approved. Fix: keep the count fixed at the moment of confirmation, or show "Approving…".
- Symptom (rare): if an item is restored and then approved while a list refresh is still loading, it can reappear after the refresh. Mechanism: `load()` re-adds everything in `restoredDuringLoad` without checking ids removed later. Fix: drop an id from `restoredDuringLoad` inside `remove(bitId:)`.
- Symptom: `PendingReviewListModel.swift` is 325 lines, over the 300-line house limit. Mechanism: the model grew with the bulk and undo flows. Fix: move the bulk and undo logic into an extension file.

END-OF-REPORT
