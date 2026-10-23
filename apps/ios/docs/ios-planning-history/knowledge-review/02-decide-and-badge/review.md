# Review 02+03: Approve/reject and Review tab badge

Verdict: APPROVED

Checked against plan.md and the server. Approve and reject `{ok:true}` decode into `EmptyResponse` (`Models.swift:73`). The 409 `no_variant` and `blocked` codes and the 404 `not_found` match `knowledge-bit-approval.controller.ts:23-57`, and count `{count}` matches `knowledge-bit-bulk-approval.controller.ts:25-27`. The double-tap guard holds: `decide` runs on the main actor, and the id goes into `inFlight` before the first suspension, so a second tap returns straight away. Buttons and swipes are disabled while busy. A row is removed only after the server confirms, and an empty source section disappears with it. Offline and unauthorized failures keep the row with a message. There are no force unwraps, and the token is untouched. The badge reads the `@Observable` shared store, so `.badge(0)` hides it. HomeView.swift got a one-line edit. My build exited 0.

## Findings

### Low
- Symptom (hypothesis, not verified on a device): rejecting by swipe while offline may make the row vanish and then reappear. Mechanism: a swipe button with `role: .destructive` asks the List to animate the row out immediately, before the server answers. Fix: drop the role and use `.tint(.red)`. Folded into item 04/05's implementation.
- Symptom: if the first load is cancelled, the spinner stays up until the tab is shown again. Mechanism: no error is set on cancellation, and `.task` only re-runs when the tab reappears. Fix: accepted. The spinner clears on the next appearance.
- Symptom: if the count request fails (offline or bad token), the badge keeps its last value. Mechanism: `refresh()` uses `try?`. Fix: accepted. This is the plan's default.

END-OF-REPORT
