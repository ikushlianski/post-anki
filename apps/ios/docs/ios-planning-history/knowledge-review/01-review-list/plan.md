# Plan 01: Review tab listing pending knowledge items grouped by source

## Goal
A new "Review" tab shows every pending knowledge item grouped by its source, each with its questions (prompt and answer), mirroring the web pending-review list. The Inbox tab is unchanged.

## Approach
Read-only list. A `PendingReviewScreen` (keeps `init()` with no args) owns an `@Observable @MainActor` model that calls one new `APIClient` extension method. No approve/reject, badge, bulk or restore here (items 02-05). No new module or dependency; follows the `KnowledgeItemInboxScreen` pattern (model + `List` + `.refreshable` + `.task`).

## Files (only these)
- `Sources/PostAnkiIOS/API/PendingReviewModels.swift` (new)
- `Sources/PostAnkiIOS/API/APIClient+PendingReview.swift` (new)
- `Sources/PostAnkiIOS/PendingReviewScreen.swift` (rewrite stub, same `struct PendingReviewScreen: View { init() {} }`)
- `Sources/PostAnkiIOS/HomeView.swift` (one tab added)

## API contract (server is read-only reference)
`GET /knowledge-bits/pending-review`, no query, no body. Bearer auth is handled by `APIClient.request`.
- Route: `apps/api/src/router-table.ts:77-81`; dispatch `apps/api/src/api-server.ts:486-487`; 401 `unauthorized` for a bad token `api-server.ts:406-408`.
- Handler: `apps/api/src/knowledge-bit/knowledge-bit-approval.controller.ts:14-20` returns 200 and a top-level JSON array. The array is capped at 200 bits (`PENDING_REVIEW_LIST_LIMIT`, line 11). No wrapper object, no pagination or cursor.
- Builder: `knowledge-bit-approval.repo.ts:189-269`. Bits are ordered by `createdAt` ascending, then grouped into sources in first-seen order. An empty result is `[]`.
- Shape actually emitted, per source: `knowledgeSourceId` (string), `sourceText` (string, nullable, the raw source text and can be very long), `subjectName` (string, nullable), `bits` (array, never empty).
- Per bit: `id`, `body` (strings), `background` (string, nullable), `origin` (`"extracted"` or `"manual"`, repo defaults null to `"extracted"`, repo lines 252-256), `variants` (array, may be empty).
- Per variant (live ones only, ordered by `order` ascending, repo lines 216-232): `id`, `kind` (`wh_question` | `fill_in_the_blank` | `basic`), `prompt`, `answer`.
- The shared type (`packages/shared/src/knowledge-bit.ts:69-108`) also lists optional `processedAt`, `groupTotal`, `extractionRun`, `extractionGrade`, `decidedCount` on sources and `feedback` on bits. The list handler never sets them. There are no date fields in this response, so no date decoding strategy is needed.
- Plain `JSONDecoder()`. Unknown keys are ignored, so those optional fields are not modelled.

## Swift models (`PendingReviewModels.swift`)
All `Decodable, Sendable, Identifiable, Hashable` (names grepped, no collisions; `PendingReview*` prefix avoids the `PendingPlacementSuggestion` types):
- `PendingReviewSource { knowledgeSourceId: String; sourceText: String?; subjectName: String?; bits: [PendingReviewBit]; var id: String { knowledgeSourceId } }`
- `PendingReviewBit { id: String; body: String; background: String?; origin: String; variants: [PendingReviewVariant] }`
- `PendingReviewVariant { id: String; kind: String; prompt: String; answer: String }`
- `kind` and `origin` stay `String` (not enums) so a new server value never fails the whole decode. A small `PendingReviewVariant.kindLabel` maps known kinds ("Question", "Fill in the blank", "Basic card") and falls back to the raw string.

## Steps
1. `PendingReviewModels.swift`: add the three structs above.
2. `APIClient+PendingReview.swift`: `extension APIClient { static func listPendingReview() async throws -> [PendingReviewSource] { try await request("/knowledge-bits/pending-review") } }`. It uses the internal `request` and does not touch `APIClient.swift`.
3. `PendingReviewScreen.swift`:
   - `PendingReviewListModel` (`@Observable @MainActor final class`): `sources: [PendingReviewSource]`, `isLoading`, `hasLoaded`, `errorMessage: String?`, `func load() async`.
   - `load()` sets `isLoading`, clears the error, then awaits the API. On success it replaces `sources` and sets `hasLoaded = true`. On failure it keeps the previous `sources` and sets a message.
   - Error mapping: `URLError` (notConnectedToInternet, networkConnectionLost, timedOut, cannotConnectToHost) gives "You're offline. Pull to refresh when you're back."; `APIError.unauthorized` gives "Your access token was rejected. Check Settings."; anything else gives "Couldn't load pending items."
   - `.task` runs the first load. Refresh on appear: `.onAppear` triggers `load()` when `hasLoaded`, so switching back to the tab refreshes. Guard with `!isLoading` to avoid double calls on first show. `.refreshable { await model.load() }` for pull-to-refresh.
   - View states inside `NavigationStack`, title "Review":
     - First load (`!hasLoaded && isLoading`): `ProgressView`.
     - Failed first load (`!hasLoaded && errorMessage != nil`): `ContentUnavailableView` with the message and a "Try again" button.
     - Loaded and empty: `ContentUnavailableView("Nothing to review", systemImage: "checkmark.seal")` (the existing stub copy).
     - Otherwise a `List` with one `Section` per source. If a refresh failed after a good load, show the message as a red caption row at the top and keep the list.
   - Section header: `subjectName` (or "No subject") plus a one-line preview of `sourceText` (`lineLimit(2)`, whitespace collapsed, "Untitled source" if nil or empty) plus "N items".
   - Bit row: `body` (headline), optional `background` (secondary caption), then one block per variant (kind label, prompt, answer). With no variants show "No questions yet" (secondary); the server rejects approving such a bit with `no_variant`. A "Manual" tag shows when `origin == "manual"`.
   - Split into private subviews in the same file (`PendingReviewSourceHeader`, `PendingReviewBitRow`, `PendingReviewVariantBlock`) to stay under 300 lines.
4. `HomeView.swift`: after the Inbox tab add `PendingReviewScreen().tabItem { Label("Review", systemImage: "checkmark.seal") }`. Change nothing else.

## Edge cases
- Empty `[]` is the empty state, not an error.
- 200-bit cap: the list may be truncated. No UI for it in this item.
- Very long `sourceText`: only a 2-line preview in the header.
- A failed refresh must not wipe an already-loaded list.
- Task cancellation (leaving the tab mid-load): treat `CancellationError` and `URLError.cancelled` as silent, with no error banner.
- Swift 6 strict concurrency: models are `Sendable` value types and the view model is `@MainActor`.

## Tests
The repo has no test target and no dependencies. No tests are added. Verify by build (`xcodegen` then `xcodebuild`) and manual checks: populated, empty, airplane mode, pull-to-refresh, tab re-entry.

## Done when
- The Review tab appears in `HomeView` after Inbox and the Inbox tab behaves as before.
- Pending items show grouped by source with every variant's prompt and answer.
- Loading, empty, first-load error with retry, offline message, pull-to-refresh and refresh-on-reappear all work.
- `PendingReviewScreen()` still compiles with no arguments, and only the four listed files changed.
- The project builds with no strict-concurrency warnings from the new files.

## Defaults chosen
- Keep `kind`/`origin` as `String`: tolerant decoding when the server adds values.
- Do not model the unemitted optional fields: they would be dead code, and the handler never sets them.
- Show only the first lines of `sourceText`: the web shows a plain-text preview and the raw text can be huge.
- Reuse the Inbox pattern (model class in the screen file) rather than a new architecture.
- Refresh on tab re-entry via `.onAppear` once loaded: the list changes server-side (web approvals).
- Use the SF Symbol `checkmark.seal`: it matches the existing stub.

## API notes for later items
All routes are in `router-table.ts`, dispatched in `api-server.ts:486-507`. Errors are `{"error": "<code>"}` via `sendError` (`apps/api/src/shared/http.ts:15-22`), which `APIClient` surfaces as `APIError.badStatus(status, code)`. 401 `unauthorized` applies to all routes.
- Count: `GET /knowledge-bits/pending-review/count` (`router-table.ts:132-136`) returns 200 `{"count": Int}` (`knowledge-bit-bulk-approval.controller.ts:25-27`, repo `knowledge-bit-bulk-approval.repo.ts:80-87`). Counts all pending bits, not capped at 200, so it can exceed the list length.
- Approve: `POST /knowledge-bits/{id}/approve`, no body (`router-table.ts:157-162`, `knowledge-bit-approval.controller.ts:23-40`). Success is 200 `{"ok": true}`. Approving an already approved bit also returns 200 (idempotent). 404 `not_found`. 409 `no_variant` (pending bit with no live variant, repo lines 44-58). 409 `blocked` (state is rejected or superseded, repo lines 40-42).
- Reject: `POST /knowledge-bits/{id}/reject`, no body (`router-table.ts:163-168`, controller lines 43-57). Success is 200 `{"ok": true, "feedbackId": String|null}`. Rejecting an already rejected bit also returns 200. 404 `not_found`. 409 `blocked` (approved or superseded). Rejection clears the bit's topic.
- Restore: `POST /knowledge-bits/{id}/restore`, no body (`router-table.ts:169-174`, `knowledge-bit-feedback.controller.ts:33-46`, repo `knowledge-bit-feedback.repo.ts:180-203`). Success is 200 `{"ok": true}`, and the bit returns to pending with its rejection feedback deleted. The only error is 404 `not_found`, which covers both a missing bit and a bit that is not currently rejected.
- Bulk approve: `POST /knowledge-bits/approvals` (`router-table.ts:152-156`, `knowledge-bit-bulk-approval.controller.ts:9-22`). Body `{"knowledgeBitIds": [String]}` with 1 to 200 ids (`BULK_APPROVAL_MAX_IDS`, `packages/shared/src/knowledge-bit.ts:110-115`). Success is 200 `{"approved": [String], "skipped": [{"id": String, "reason": "not_found"|"already_decided"|"no_variant"}]}` (shared lines 119-128, repo `knowledge-bit-bulk-approval.repo.ts:9-78`). Skips are reported inside a 200, not as errors. Invalid body is 400 `{"error": "invalid_input", "message": ...}`. A source with more than 200 bits needs chunking. The list itself is capped at 200 bits, so one source never exceeds that today.
- Single-item routes return an empty-ish JSON object, so decode into a small `Decodable` result struct, or `EmptyResponse` from `Models.swift:72`.

END-OF-REPORT
