# Plan 04+05: Approve all from one source, and undo a reject

## Goal
The learner approves every ready item of one source with one tap (after a confirmation), and can undo a just-made reject from a bottom banner for a few seconds.

## Behaviour
Builds on plan 02's `PendingReviewListModel` (`decide(_:bitId:)`, `remove(bitId:)`, `inFlight`, `rowMessages`, `notice`, `removedDuringLoad`, `counts`). No new module or contract. No tests (repo has no test target); verify by build and the manual list below.

Approve all (mirrors web `knowledge-bit-review-source-group.tsx:101-120` and `knowledge-bit-review-bulk-approval.ts:35-77`):
- Section footer button "Approve all (N)", where N = bits with at least one variant that are not in `inFlight`. Shown only when N > 1, same as web (`readyCount > 1`). Bits without variants are never sent (web filters them client-side too).
- Confirmation: yes, a `.confirmationDialog` "Approve N items?" with Approve and Cancel. Web has an inline Confirm/Cancel, and a bulk approve has no server undo.
- Tap Confirm: ids are re-computed at confirm time. They go into `inFlight` (row buttons disabled) and the source id goes into `bulkInFlight` (footer button shows a spinner and is disabled). Both are cleared in `defer`.
- Ids are sent in chunks of 200, sequentially. If a later chunk throws, earlier chunks' results are kept, and the source message says "Approved X of Y. Couldn't finish, try again."
- Per result: `approved` ids and skips with `already_decided` or `not_found` are removed from the list (web removes the same set). `no_variant` skips stay and get a row message "This item has no questions yet, so it can't be approved."
- Count: `counts.adjust(by: -approved.count)`. If any `already_decided` or `not_found` skip was removed, also `Task { await counts.refresh() }` (server already counts them out; a refresh avoids local drift).
- Source message, shown as a caption row under the footer button (`sourceMessages[sourceId]`), same wording as web `describeBulkApprovalResult`: "Approved 4. Skipped 2: 1 already decided, 1 has no questions yet." Cleared on the next bulk tap and on a successful `load()`.
- Whole-request errors reuse a bulk mapping: offline gives "You're offline. Nothing was changed, try again when you're back."; `unauthorized` gives "Your access token was rejected. Check Settings."; else "Couldn't approve these items. Try again." Nothing is removed. `CancellationError` and `URLError.cancelled` are silent.

Undo reject (mirrors web strip: `knowledge-bit-review-why-strip.tsx`, 5 s visible `knowledge-bit-review-decision-feedback.ts:1`, restore via `restoreBit` in `knowledge-bit-review-sources.ts:80-142`):
- Right after `decide(.reject)` returns `.removed`, the model sets `pendingUndo` and shows a bottom banner "Item rejected" with an Undo button and a dismiss X. Auto-dismiss after 8 s (longer than web's 5 s for thumb reach; the default is to be a bit generous on a phone).
- Snapshot taken before the request: `PendingReviewRemovedBit { sourceId, sourceText, subjectName, index, bit }`. Undo re-inserts the bit at `min(index, bits.count)` in its source. If the source is gone, it is recreated and put at the top of `sources` (web does the same).
- Only one undo at a time: a new successful reject replaces it and cancels its timer. Approve does not touch it. A bulk approve leaves it alone.
- Tap Undo: `isRestoring = true` (button disabled, spinner; the timer does not dismiss while restoring). Call restore. On success: clear `removedDuringLoad` entry for the id, re-insert, `counts.adjust(by: +1)`, dismiss the banner.
- Errors: 404 `not_found` converts the banner to the message "Couldn't restore. It was already changed." with no Undo button, dismissed after 4 s, plus `Task { await counts.refresh() }` and `Task { await load() }`. Offline or other failure keeps the banner with a one-line message ("You're offline. Try Undo again." / "Couldn't restore. Try again.") and restarts the timer at 8 s so the learner can retry. Unauthorized shows the Settings message and dismisses after 4 s. Cancellation is silent.
- A `load()` running while a restore succeeds would overwrite the re-insert. So `load()` clears `restoredDuringLoad` at start, and re-applies those snapshots (skipping any bit already present) after assigning `sources`. Same idea as `removedDuringLoad`.
- If a refresh brings back the same bit id (restored elsewhere), `insert` is a no-op for duplicates.

## Files (same set as 02, no others)
- `API/PendingReviewModels.swift` (bulk request/result types, snapshot type, bulk and restore error mapping)
- `API/APIClient+PendingReview.swift` (two functions)
- `PendingReviewScreen.swift` (model additions, banner overlay)
- `PendingReviewRows.swift` (if absent, move the private row/header/variant views there from the screen file, drop `private`, so the screen stays under 300 lines; add the section footer view)
- `PendingReviewUndoBanner.swift` (new, banner view only)
- `PendingReviewCountStore.swift` is not changed (`adjust(by:)` and `refresh()` already exist). No `HomeView`, `HomeScreen`, `APIClient.swift`, `Models.swift` edits.

## API contract (server read-only)
- Bulk approve: `POST /knowledge-bits/approvals`, `router-table.ts:152-156`, controller `knowledge-bit-bulk-approval.controller.ts:9-22`, repo `knowledge-bit-bulk-approval.repo.ts:9-78`. Body `{"knowledgeBitIds":[String]}`, 1 to 200 ids (`packages/shared/src/knowledge-bit.ts:110-115`). 200 `{approved:[String], skipped:[{id, reason}]}` with reason `not_found | already_decided | no_variant` (shared `:117-128`). 400 `invalid_input` (empty or over 200; the client prevents both). 401 handled by `APIClient`.
- Restore: `POST /knowledge-bits/{id}/restore`, no body, `router-table.ts:169-174`, `knowledge-bit-feedback.controller.ts:33-46`, repo `knowledge-bit-feedback.repo.ts:180-203`. 200 `{ok:true}`; bit goes back to pending. Only error: 404 `not_found` (missing, or not currently rejected).
- Web callers for reference: `apps/web/src/curriculum/api-client.ts:517` and `:533`.

## Swift shapes
- Models: `struct PendingReviewBulkApprovalInput: Encodable, Sendable { let knowledgeBitIds: [String] }`; `struct PendingReviewBulkApprovalResult: Decodable, Sendable { let approved: [String]; let skipped: [PendingReviewBulkSkip] }`; `struct PendingReviewBulkSkip: Decodable, Sendable { let id: String; let reason: String }` (reason stays `String` for tolerant decoding, like `kind`); `struct PendingReviewRemovedBit: Sendable { let sourceId: String; let sourceText: String?; let subjectName: String?; let index: Int; let bit: PendingReviewBit }`; `func PendingReviewBulkApprovalResult.summary() -> String`; `enum PendingReviewRestoreOutcome: Sendable { case restored; case alreadyChanged; case retryable(message: String); case fatal(message: String); case cancelled }` with `static func restoreOutcome(for: Error)`; `static func bulkErrorMessage(for: Error) -> String?` (nil means silent).
- API: `static func approveKnowledgeBits(ids: [String]) async throws -> PendingReviewBulkApprovalResult` (`request("/knowledge-bits/approvals", method: "POST", body: PendingReviewBulkApprovalInput(knowledgeBitIds: ids))`); `static func restoreKnowledgeBit(id: String) async throws` (`EmptyResponse`, POST).
- Model state (in `PendingReviewListModel`): `private(set) var bulkInFlight: Set<String>`, `sourceMessages: [String: String]`, `private(set) var pendingUndo: PendingReviewUndo?`, `restoredDuringLoad: [PendingReviewRemovedBit]` (not observed). `struct PendingReviewUndo { let removed: PendingReviewRemovedBit; var isRestoring = false; var message: String?; var canRetry = true }`.
- Model methods: `func approveAll(sourceId: String) async`, `func undoReject() async`, `func dismissUndo()`, `private func scheduleUndoExpiry(after seconds: Double)`, `private func insert(_ removed: PendingReviewRemovedBit)`, `private func remove(bitIds: Set<String>)` (loops `remove(bitId:)` inside one `withAnimation`).
- Timer: `@ObservationIgnored private var undoTask: Task<Void, Never>?`. `scheduleUndoExpiry` cancels the old task, then `undoTask = Task { try? await Task.sleep(for: .seconds(seconds)); guard !Task.isCancelled else { return }; await MainActor.run { ... } }` inside the `@MainActor` class so it inherits main-actor isolation; the closure re-checks `pendingUndo?.isRestoring != true` and that the undo's id still matches before clearing. Cancel in `dismissUndo`, on replace, on restore success, and in `deinit`-safe fashion (the Task captures `[weak self]`).
- Banner: `struct PendingReviewUndoBanner: View { let undo: PendingReviewUndo; let onUndo: () -> Void; let onDismiss: () -> Void }`, capsule or rounded material background, `.accessibilityElement(children: .contain)`. Screen attaches it with `.safeAreaInset(edge: .bottom)` on the list container with `.transition(.move(edge: .bottom).combined(with: .opacity))`.

## Steps
1. `PendingReviewModels.swift`: add the types and mappings above.
2. `APIClient+PendingReview.swift`: add `approveKnowledgeBits(ids:)` and `restoreKnowledgeBit(id:)`.
3. `PendingReviewScreen.swift` model: in `decide`, before sending a `.reject`, build the snapshot from `sources` (find source and index); on `.removed` for reject, set `pendingUndo` and call `scheduleUndoExpiry(after: 8)`. Add `approveAll`, `undoReject`, `dismissUndo`, `insert`, `remove(bitIds:)`. Update `load()` for `restoredDuringLoad` and clearing `sourceMessages`.
4. `approveAll`: guard source exists and not in `bulkInFlight`; collect ready ids; `inFlight.formUnion`, `bulkInFlight.insert`; `defer` cleans both; loop `ids.chunked(200)`; per chunk apply the result (remove, row messages for `no_variant`, accumulate counts); catch ends the loop with the partial message; finally adjust the count and set `sourceMessages`.
5. `undoReject`: guard `pendingUndo` exists and `!isRestoring`; set `isRestoring`; call restore; switch on the outcome as in Behaviour.
6. `PendingReviewRows.swift` and screen: add the section footer (button, spinner, confirmation dialog state `@State private var confirmingSourceId: String?`, message caption) and attach the banner. Disable the footer button while `bulkInFlight.contains(id)`.
7. `PendingReviewUndoBanner.swift`: the banner view with Undo (disabled and spinner while `isRestoring`), dismiss X, optional message line.
8. Build: `xcodegen` then `xcodebuild`; confirm no strict-concurrency warnings and every file under about 300 lines.

## Edge cases
- Row decide and bulk on the same bit: the `inFlight` guard makes the second a no-op; bulk skips ids already in flight.
- A bit decided on web before the bulk tap: comes back as `already_decided`, removed silently with the count refresh.
- Source has exactly one ready bit: no footer button (use the row's own Approve).
- Source emptied by the bulk: section disappears (via `remove(bitId:)`); if every source is empty, the "Nothing to review" state shows.
- Undo after leaving the tab: the model lives in the screen's `@State`, so the banner persists until the timer; the restore still works.
- Undo of a bit whose source was fully approved in the meantime: the source is recreated at the top.
- Double-tap Undo: second tap is a no-op because of `isRestoring`.
- Reject twice quickly: the first banner is replaced and its bit can no longer be undone from the app (it can be restored from the web). Accepted: one undo at a time.
- Restore succeeds server-side but the response is lost (offline after send): retry gets 404, the banner shows "already changed", and the load refreshes the list so the bit reappears.

## Done when
- A source with 2 or more ready items shows "Approve all (N)"; confirming it removes approved items, keeps `no_variant` ones with a message, shows the summary, and drops the badge by the approved count.
- Footer and row buttons are disabled during the request; a second tap sends nothing.
- More than 200 ids go out as several requests.
- After a reject, the banner appears for about 8 s; Undo restores the item at its old position (recreating the source if needed) and raises the badge by one.
- 404, offline and double-tap behaviours are as above; the timer never fires after dismiss or replace.
- Only the listed files changed; build is warning-free; `PendingReviewScreen()` still compiles with no args.

## Defaults chosen
- Confirmation dialog for approve-all: web confirms and bulk approve is irreversible.
- Button only when 2 or more ready: web does the same.
- Reject has no confirmation but gets Undo: matches web.
- Banner 8 s instead of web's 5 s: touch targets and VoiceOver need more time.
- Banner stays with retry on offline errors, dismisses on 404: only a retry can help in the first case.
- Sequential chunks, partial results kept: preserves order and avoids overwhelming the server.
- Skip reason kept as `String`: a new server reason must not fail the decode.
- Recreated source goes to the top: same as web `restoreBit`.
- No reject-reason ("why") UI: out of scope for these todos.

END-OF-REPORT
