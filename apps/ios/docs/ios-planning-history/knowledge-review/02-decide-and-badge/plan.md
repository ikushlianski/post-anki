# Plan 02+03: Approve/reject pending items, and a pending-count badge on the Review tab

## Goal
The learner approves or rejects each pending item from the Review list (buttons or swipes), the item leaves the list once the server confirms, and the Review tab badge shows the server's pending count.

## Approach
Builds on item 01's `PendingReviewListModel` and `PendingReviewScreen` (`init()` stays arg-less). Confirmed removal: the row stays until the server answers 200, then it is removed (and its source section too if it was the last bit). Reason: approve has no server undo, 409s (`no_variant`, `blocked`) are common, and rollback of an optimistic removal makes rows jump. While a request is in flight the id sits in `inFlight`, and both buttons and swipe actions for that row are disabled (double-tap guard). No queueing offline.
Decision logic lives in the model, as `decide(_:bitId:) async -> PendingReviewDecisionOutcome`, with no view types, so item 04 (approve all from one source) and item 05 (undo reject via `POST /knowledge-bits/{id}/restore`, then `+1` on the count store) reuse it. Nothing new beyond `brief.md`, no tests (repo has no test target).

## API contract (server read-only)
Routes: `apps/api/src/router-table.ts` approve 157-162, reject 163-168, count 132-136. Handlers: `knowledge-bit-approval.controller.ts` approve 23-40, reject 43-57; count `knowledge-bit-bulk-approval.controller.ts:25-27`. 401 handled by `APIClient`.
- `POST /knowledge-bits/{id}/approve`, no body: 200 `{ok:true}` (idempotent), 404 `not_found`, 409 `no_variant`, 409 `blocked` (rejected/superseded).
- `POST /knowledge-bits/{id}/reject`, no body: 200 `{ok:true, feedbackId}` (idempotent; `feedbackId` ignored here), 404 `not_found`, 409 `blocked`.
- `GET /knowledge-bits/pending-review/count`: 200 `{count:Int}`, all pending bits (not capped at 200).
- Errors arrive as `APIError.badStatus(status, code)` / `.unauthorized`; offline as `URLError`. Single-item calls decode into `EmptyResponse` (`Models.swift:73`).

## Files (only these)
`API/PendingReviewModels.swift`, `API/APIClient+PendingReview.swift`, `PendingReviewScreen.swift`, `HomeView.swift` (Review tab line only), new `PendingReviewCountStore.swift`. Nothing else, including `HomeScreen.swift`, `APIClient.swift`, `Models.swift`.

## Swift shapes
- Models: `struct PendingReviewCountResponse: Decodable, Sendable { let count: Int }`; `enum PendingReviewDecision: Sendable { case approve, reject }` (`verb`: "approve"/"reject"); `enum PendingReviewDecisionOutcome: Sendable { case removed; case removedElsewhere; case kept(message: String) }`; `extension PendingReviewDecision { func outcome(for error: Error) -> PendingReviewDecisionOutcome }` holds the per-code mapping.
- API: `approveKnowledgeBit(id:)`, `rejectKnowledgeBit(id:)` (both `async throws`, `let _: EmptyResponse = try await request("/knowledge-bits/\(id)/approve", method: "POST")`), `pendingReviewCount() async throws -> Int`.
- Store: `@Observable @MainActor final class PendingReviewCountStore { static let shared; private(set) var count = 0; func refresh() async; func adjust(by delta: Int) }`.
- List model additions: `private(set) var inFlight: Set<String>`, `rowMessages: [String: String]`, `notice: String?`, `func decide(...)`, `private func remove(bitId:)`.

## Steps
1. `PendingReviewModels.swift`: add the count response, decision enum, outcome enum, and `outcome(for:)`. Mapping: `badStatus(409,"no_variant")` -> `.kept("This item has no questions yet, so it can't be approved.")`; `badStatus(409,"blocked")` and `badStatus(404,"not_found")` -> `.removedElsewhere`; `URLError` offline codes (same four as item 01) -> `.kept("You're offline. Nothing was changed, try again when you're back.")`; `.unauthorized` -> `.kept("Your access token was rejected. Check Settings.")`; `CancellationError`/`URLError.cancelled` -> `.kept("")` treated as silent; anything else -> `.kept("Couldn't \(verb) this item. Try again.")`.
2. `APIClient+PendingReview.swift`: add the three static funcs.
3. `PendingReviewCountStore.swift`: `refresh()` skips if a refresh is already running, records a `mutations` counter, fetches, and if `mutations` changed meanwhile it discards the result and fetches once more, else sets `count = max(0, value)`. Failure keeps the last count and shows nothing. `adjust(by:)` bumps `mutations` and sets `count = max(0, count + delta)`. Private `init()` starts one `refresh()` Task and registers `NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main)` whose closure only spawns `Task { @MainActor in await Self.shared.refresh() }` (import UIKit). `shared` is created the first time `HomeView` reads it, so no `HomeView` scene-phase edit is needed.
4. `PendingReviewScreen.swift` model:
   - `decide`: return `.kept("")` if the id is already in `inFlight`; insert the id, clear its row message and `notice`; call approve or reject; always remove from `inFlight` after.
   - Success: `remove(bitId:)` inside `withAnimation`, `counts.adjust(by: -1)`, return `.removed`.
   - `.removedElsewhere`: `remove(bitId:)`, set `notice = "That item was already decided elsewhere, so it was removed."`, `Task { await counts.refresh() }` (server count is already right, so no local decrement).
   - `.kept(msg)`: set `rowMessages[id] = msg` unless empty; item stays.
   - `remove(bitId:)` drops the bit, then drops the source if `bits` is empty. It also inserts the id in `removedDuringLoad`.
   - `load()`: clear `removedDuringLoad` at start, filter those ids out of the fetched sources (a slow refresh must not resurrect a just-decided item), clear `rowMessages` and `notice` on success, then `Task { await counts.refresh() }`. The model takes `counts: PendingReviewCountStore = .shared`.
5. `PendingReviewScreen.swift` views: `PendingReviewBitRow` gets `isBusy: Bool`, `message: String?`, `onDecide: (PendingReviewDecision) -> Void`. Below the variants add a button row: Reject (`.bordered`, red tint) and Approve (`.borderedProminent`), both `.buttonStyle` borderless-safe (set `.buttonStyle(.borderless)` wrapper so a List row tap does not fire both), `.disabled(isBusy)`; Approve also disabled when `bit.variants.isEmpty`. Show a `ProgressView` in the row while busy and the row message as red caption. Swipe: `.swipeActions(edge: .trailing, allowsFullSwipe: false)` Reject (`role: .destructive`) and `.swipeActions(edge: .leading, allowsFullSwipe: false)` Approve (green, omitted when no variants), each `.disabled(isBusy)`. The `notice` shows as a secondary caption row at the top of the list. If emptying the list leaves `sources` empty, the existing "Nothing to review" state shows.
6. `HomeView.swift`: append `.badge(PendingReviewCountStore.shared.count)` after the Review `.tabItem`. `.badge(0)` hides the badge. Nothing else changes.

## Edge cases
- Last bit of a source removed -> section disappears; last source removed -> empty state.
- Approving a no-variant bit from a stale row -> 409 `no_variant` message, item kept, count unchanged.
- Idempotent 200 (already decided by same action elsewhere) is treated as success; count may be off by one until the next refresh (foreground, tab appear, list load).
- Offline: item kept, row message, no retry queue, nothing persisted.
- Swipe or tap on a row whose request is in flight is a no-op.
- Count above 200 stays accurate because it comes from the count route, not the list length.
- Swift 6: store and model are `@MainActor`; outcome and decision enums are `Sendable`; the notification closure only hops to the main actor.

## Tests
No test target exists, so no tests added. Manual: approve, reject, approve with no questions, airplane mode, decide an item on web then act on it in the app, rapid double-tap, last item in a source, badge at 0 / 1 / 200+, background and foreground.

## Done when
- Approve/reject by button and by swipe remove the row and empty sections only after a 200.
- Each error code shows its message (or removes the row with the notice) as above; no request is double-sent.
- Review tab badge equals the server count, drops by one per decision, hides at 0, and refreshes on foreground and list load.
- Only the five listed files changed; `PendingReviewScreen()` still compiles; the screen file stays under 300 lines (if it would not, trim views rather than add files); build has no concurrency warnings.

## Defaults chosen
- Confirmed (not optimistic) removal: no server undo for approve, and failures are common.
- Both swipe directions `allowsFullSwipe: false`: avoids accidental irreversible approves.
- No confirmation dialog for reject: item 05 adds undo.
- Approve disabled for bits with no variants: the row already says "No questions yet"; the 409 is still handled for stale rows.
- Count store is a `shared` singleton that self-starts: avoids editing `HomeView` beyond the badge line and `HomeScreen`.
- Local decrement plus drop-stale-refresh guard, not refetch after every decision: instant badge, no flicker.
- Decision-outcome mapping sits in `PendingReviewModels.swift`: keeps the screen under 300 lines and reusable by items 04/05.

END-OF-REPORT
