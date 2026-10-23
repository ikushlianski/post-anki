# Manage knowledge: browse, edit, suspend, delete, move, reject reasons

## Goal
Covers the five coding tasks in `.planning/manage-knowledge/todo.md`:
1. A Knowledge list of every approved item, filtered by subject and status, with search.
2. Editing an item's wording and its question variants.
3. Suspend / unsuspend, and a Suspended list.
4. Bulk delete and bulk move of selected items.
5. A reason prompt after rejecting a pending item, sent as feedback.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-408`, 401). Errors are `{ "error": "<code>" }`; validation failures are 400 `{ "error": "invalid_input", "message": ... }` where `message` may be an array, so only `error` is decoded (existing `APIErrorBody`). Dates are ISO strings.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /knowledge-bits/overview` | `apps/api/src/router-table.ts:138-141`, `apps/api/src/api-server.ts:491`, `apps/api/src/knowledge-bit/knowledge-bit-overview.controller.ts:7-21` | query `subjectId?`, `q?` (trimmed, max 200), `limit` 1-100 default 50, `offset` default 0 (`packages/shared/src/knowledge-bit-overview.ts:5-10`) | `{ items: [{ knowledgeBitId, question, answer, subjectId: string|null, state, dueAt: string|null, lapses: int }], hasMore: bool }` (`knowledge-bit-overview.ts:25-40`) | 400 |
| `PATCH /knowledge-bits/:id` | `router-table.ts:182-186`, `api-server.ts:702`, `knowledge-bit-edit.controller.ts:10-30` | `{ body: string (1-50000, trimmed), background?: string|null }` (`packages/shared/src/knowledge-bit-chat.ts:61-64`) | `{ ok: true }` | 400, 404 `not_found` |
| `PATCH /knowledge-bits/question-variants/:id` | `router-table.ts:126-130`, `api-server.ts:513`, `knowledge-bit-approval.controller.ts:60-86` | `{ prompt, answer }` both non-empty trimmed (`packages/shared/src/knowledge-bit.ts:60-63`) | `{ ok: true, variantId: string }` (new id) | 400, 404 `not_found`, 409 `blocked` |
| `PATCH /knowledge-bits/:id/schedule` | `router-table.ts:108-112`, `api-server.ts:485`, `knowledge-bit-review.controller.ts:73-95` | `{ suspended?: bool, buried?: bool, tz: IANA (default "UTC") }`, at least one of the two flags (`packages/shared/src/knowledge-bit-review.ts:103-111`) | `{ knowledgeBitId, suspended: bool, buriedUntil: string|null, leech: bool }` (`knowledge-bit-review.ts:115-120`) | 400, 403 `not_approved`, 404 `not_found` |
| `GET /knowledge-bits/suspended` | `router-table.ts:87-91`, `api-server.ts:477`, `knowledge-bit-suspended.controller.ts:7-23` | query `limit` 1-50 default 50, `offset` (`packages/shared/src/knowledge-bit-suspended.ts:3-6`) | `{ items: [{ knowledgeBitId, itemText, question, answer, subjectName: string|null, reason: "suspended"|"leech"|"buried", lapses, suspended: bool, buriedUntil: string|null, since: string|null }], hasMore }` (`knowledge-bit-suspended.ts:14-32`) | 400 |
| `POST /knowledge-bits/deletions` | `router-table.ts:142-146`, `api-server.ts:493`, `knowledge-bit-delete.controller.ts:7-19` | `{ knowledgeBitIds: [string] }` 1-200 (`knowledge-bit-overview.ts:44-56`) | `{ deleted: [id], skipped: [{ id, reason }] }` | 400 |
| `POST /knowledge-bits/moves` | `router-table.ts:147-151`, `api-server.ts:495`, `knowledge-bit-move.controller.ts:7-26` | `{ knowledgeBitIds: [string] 1-200, subjectId: string }` (`knowledge-bit-overview.ts:67-70`) | `{ moved: [id], skipped: [{ id, reason }] }` | 400, 404 `subject_not_found` (`knowledge-bit-move.repo.ts:31`) |
| `POST /knowledge-bits/:id/reject` (already called) | `router-table.ts:163-167`, `api-server.ts:505`, `knowledge-bit-approval.controller.ts:43-57` | none | `{ ok: true, feedbackId: string|null }` (`packages/shared/src/knowledge-bit-review-feedback.ts:63-66`) | 404, 409 `blocked` |
| `PATCH /knowledge-bit-feedback/:id` | `router-table.ts:175-179`, `api-server.ts:509`, `knowledge-bit-feedback.controller.ts:11-31` | `{ reasonCode?, note?: string (max 500), rating?: 1-5 }` (`knowledge-bit-review-feedback.ts:54-58`) | `{ ok: true }` | 400, 404 `not_found` (also when the body has no fields, `knowledge-bit-feedback.repo.ts:166-168`) |

Quirks that shape the UI:
- Overview `state` enum: `new, learning, review, relearning, suspended, buried` (`knowledge-bit-overview.ts:14-21`). There is no status query param, and the list holds only approved items with a live question (`knowledge-bit-overview.repo.ts:46-90`). The subject filter includes child subjects.
- Overview rows carry the preferred question's text but no variant id and no item body (`knowledge-bit-overview.repo.ts:123-140`), and no GET route returns an approved item's variants with ids. Variant ids exist only in the pending-review list (already decoded in `API/PendingReviewModels.swift`) and on due review cards (`ReviewCard.variantId` in `API/ScheduledReviewModels.swift`).
- Item wording (`PATCH /knowledge-bits/:id`) only succeeds for pending items; approved ones return 404 (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts:192-197`). Changing the body regenerates all questions server-side (`knowledge-bit.repo.ts:209-227`); a background-only change does not.
- A variant edit replaces the variant with a new id (`knowledge-bit-approval.repo.ts:110-185`); the caller must swap ids. 409 `blocked` means the item was rejected or superseded.
- Skip reasons: `not_found`, `not_approved`, `curriculum_placed` (`knowledge-bit-overview.ts:46`); delete uses the first two, move all three (`knowledge-bit-delete.repo.ts:43`, `knowledge-bit-move.repo.ts:59-69`).
- Reject reasons (`knowledge-bit-review-feedback.ts:3-37`): `wrong_language`, `too_vague_or_no_context`, `meta_wording`, `not_a_fact_or_trivial`, `wrong_or_unsupported_answer`, `duplicate_or_overlap`, `bad_format`, `other`, with the labels at lines 27-36.
- Unsuspend mirrors web: send `suspended: false` when `suspended`, and `buried: false` when `buriedUntil` is set (`apps/web/src/knowledge-bit/suspended-cards-screen.tsx:70-75`).

## Dropped
- Editing wording from the Knowledge list: the list response has no variant id or body (see quirks), so the detail screen is read-only for text. Editing lives where ids exist: the Review tab (pending items: wording, background and every variant) and the Due today card (the variant on screen). This matches web, where the overview has no edit either.
- A server-side status filter: none exists; status filtering is client-side over loaded pages, except "Suspended", which uses the dedicated suspended list.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/KnowledgeManageModels.swift` (~150 lines): models below, skip/reason labels, `KnowledgeManageError` mapper.
- `API/APIClient+KnowledgeManage.swift` (~90 lines): `knowledgeOverview(subjectId:q:limit:offset:)` (query built with `URLComponents`), `editKnowledgeBit(id:body:background:)`, `editQuestionVariant(id:prompt:answer:) -> String` (new id), `setSchedule(id:suspended:buried:)` (sends `TimeZone.current.identifier`), `suspendedKnowledgeBits(offset:)`, `deleteKnowledgeBits(ids:)`, `moveKnowledgeBits(ids:subjectId:)`, `setRejectFeedback(id:reasonCode:note:)`.
- `KnowledgeListModel.swift` (~170 lines): paging, filters, search, selection, bulk actions.
- `KnowledgeListScreen.swift` (~190 lines): list, filters, edit mode, bulk toolbar, move sheet.
- `KnowledgeItemDetailScreen.swift` (~120 lines): read-only item with suspend toggle.
- `SuspendedKnowledgeScreen.swift` (~150 lines): model and list with "Bring back".
- `QuestionVariantEditSheet.swift` (~90 lines): prompt/answer form used by both edit entry points.
- `PendingReviewEditSheet.swift` (~130 lines): edit a pending item's wording, background and variants.
- `PendingReviewListModel+Feedback.swift` (~80 lines): reason prompt state and submit.
- `RejectReasonSheet.swift` (~80 lines): reason picker plus optional note.
- `DueReviewModel+Edit.swift` (~40 lines): swap the current card after an edit.

Changed (owned only by this plan): `API/APIClient+PendingReview.swift`, `PendingReviewListModel.swift`, `PendingReviewListModel+BulkUndo.swift`, `PendingReviewScreen.swift`, `PendingReviewRows.swift`, `DueReviewModel.swift`, `DueReviewScreen.swift`. No other plan touches these.

## Swift models (`API/KnowledgeManageModels.swift`)
`Decodable, Sendable, Hashable` unless noted; `Encodable, Sendable` for inputs.
- `KnowledgeOverviewItem { knowledgeBitId, question, answer: String; subjectId: String?; state: String; dueAt: String?; lapses: Int }`, `id` = `knowledgeBitId`. `state` stays `String`; `var stateLabel` maps the six known values.
- `KnowledgeOverviewPage { items: [KnowledgeOverviewItem]; hasMore: Bool }`.
- `SuspendedKnowledgeItem { knowledgeBitId, itemText, question, answer: String; subjectName: String?; reason: String; lapses: Int; suspended: Bool; buriedUntil: String?; since: String? }`, `SuspendedKnowledgePage { items; hasMore }`.
- `KnowledgeBulkSkip { id, reason: String }`, `KnowledgeBulkDeleteResult { deleted: [String]; skipped: [KnowledgeBulkSkip] }`, `KnowledgeBulkMoveResult { moved: [String]; skipped }`, with `summary()` text like `PendingReviewBulkApprovalResult.summary()`.
- `ScheduleControlResult { knowledgeBitId: String; suspended: Bool; buriedUntil: String?; leech: Bool }`.
- `EditVariantResult { ok: Bool; variantId: String }`, `RejectKnowledgeBitResult { ok: Bool; feedbackId: String? }`.
- Inputs: `KnowledgeBitIdsInput { knowledgeBitIds }`, `MoveKnowledgeBitsInput { knowledgeBitIds, subjectId }`, `EditKnowledgeBitInput { body: String; background: String? }` (encodes `null` explicitly when cleared, like web), `EditVariantInput { prompt, answer }`, `ScheduleControlInput { suspended: Bool?; buried: Bool?; tz: String }` (omits nil keys), `RejectFeedbackInput { reasonCode: String; note: String? }` (omits nil note).
- `enum RejectReason: String, CaseIterable, Sendable` with the eight codes and their labels.
- `enum KnowledgeManageError` with `message(for:action:)`: offline, unauthorized ("Check Settings"), `404 not_found` / `409 blocked` ("This item was changed elsewhere"), `403 not_approved`, `404 subject_not_found`, generic.

## Screens and behaviour

### Knowledge list (`KnowledgeListScreen`, `KnowledgeListModel`)
- Entry: a leading toolbar button "All items" (`list.bullet.rectangle`) on `PendingReviewScreen`, shown only when it is the Review tab (no `onDone`), pushing `KnowledgeListScreen` inside the existing `NavigationStack`.
- Model state: `items`, `hasMore`, `offset`, `subjectId: String?`, `query`, `statusFilter` (All, New, Learning, Review, Suspended), `subjects: [Subject]` (from existing `APIClient.listSubjects()`), `selection: Set<String>`, `isLoading`, `isLoadingMore`, `failure`, `notice`.
- Load: first page `limit=50, offset=0`; `loadMore()` when the last row appears and `hasMore`. Filter or search change resets to page one and cancels the in-flight task. Search uses `.searchable`, debounced 300 ms; empty query sends no `q`.
- Status filter is a menu; "Learning" covers `learning` and `relearning`; it filters loaded items in memory, and the footer says "Filtering loaded items" while `hasMore`. Choosing "Suspended" pushes `SuspendedKnowledgeScreen` instead.
- Subject filter: toolbar menu "All subjects" plus each subject; row caption shows the subject name looked up from `subjects`.
- Row: question (2 lines), answer (secondary, 1 line), state chip, relative due date via `DueReviewModel.nextDueText(_:)`, lapses when > 0. Tap pushes `KnowledgeItemDetailScreen`.
- Select: `EditButton`; `List(selection:)`. Bottom toolbar shows "Move" and "Delete" with the count, disabled when empty or above 200 (caption "Select up to 200").
- Delete: confirmation dialog "Delete N items? This can't be undone." Calls deletions; removes `deleted` ids locally, clears selection, shows `summary()` as a notice (skipped reasons labelled).
- Move: sheet listing subjects; on pick calls moves, shows the summary, then reloads page one (items may leave the filtered scope). 404 `subject_not_found` shows its message and reloads subjects.
- States: first load `ProgressView`; first-load failure `ContentUnavailableView` with "Try again"; empty with no filter "No approved items yet"; empty with filter/search "No matching items"; later failures show a red caption and keep rows. Pull to refresh reloads page one.

### Item detail (`KnowledgeItemDetailScreen`)
- Shows question, answer, state, due, lapses, subject. Primary action toggles Suspend / Unsuspend via `setSchedule`; on success the state updates locally and the list item is updated through an `onChange` closure from the list model. `buried` items show "Bring back today" (`buried: false`). 403/404 show the mapped message.
- Caption: "To change the wording, edit it while reviewing it." No text editing here (see Dropped).

### Suspended list (`SuspendedKnowledgeScreen`)
- Pages of 50 with load-more. Row: question, answer, subject, reason chip ("Suspended", "Leech", "Buried until <relative>"), "since" relative date. Swipe or button "Bring back" sends the web-mirroring body, then removes the row. Empty: `ContentUnavailableView("Nothing suspended", systemImage: "pause.circle")`. Pull to refresh.

### Edit in the Review tab (`PendingReviewEditSheet`)
- `PendingReviewBitRow` gets an "Edit" button (borderless, next to Reject/Approve) via a new `onEdit` closure. The screen presents the sheet for that bit.
- Sheet: body and background text fields, then each variant with its own prompt/answer fields. Save sends only what changed: wording through `editKnowledgeBit` (background cleared sends `null`), each changed variant through `editQuestionVariant`. If the body changed, a footer warns "Changing the wording regenerates its questions", and variant edits are disabled in that save.
- After save the sheet closes and the list reloads (new variant ids, possibly regenerated questions). 404/409 close the sheet and show "This item was changed elsewhere" as a notice, then reload.

### Edit on the Due today card (`QuestionVariantEditSheet`, `DueReviewModel+Edit`)
- `DueReviewScreen` toolbar gets a pencil `ToolbarItem` when `state == .card` and not grading. It presents `QuestionVariantEditSheet(prompt:answer:)` with the current card's text.
- On save: `editQuestionVariant(id: current.variantId, ...)`, then `model.applyEdit(newVariantId:prompt:answer:)` replaces `current` with a copy carrying the new id and text, keeping reveal state. 404/409 show "This card was changed or removed elsewhere" in the sheet.

### Reject reason (`RejectReasonSheet`, `PendingReviewListModel+Feedback`)
- `APIClient.rejectKnowledgeBit(id:)` now returns `String?` (decoded `feedbackId`) instead of discarding the body.
- In `decide`, after a successful reject with a non-nil `feedbackId`, the model sets `pendingFeedback = (feedbackId, bit body)`. The screen shows a sheet with the eight reasons as a list, an optional note (max 500, counter), "Send" and "Skip". The undo banner stays visible behind it.
- Send calls `setRejectFeedback`; success closes the sheet; failure keeps it open with the mapped message. Undoing the reject clears `pendingFeedback`. Bulk approve paths are unchanged. A nil `feedbackId` skips the prompt.

## Shared-file edits (all owned by this plan)
Re-read before editing; targeted `Edit` only.
- `API/APIClient+PendingReview.swift`: `rejectKnowledgeBit` returns `String?`; caller in `PendingReviewListModel.decide` uses `_ =` for the approve branch only.
- `PendingReviewListModel.swift` (174 lines): add `var pendingFeedback: PendingRejectFeedback?`; set it after a successful reject; net growth under 10 lines. `PendingReviewListModel+BulkUndo.swift`: one line in `undoReject()` clears `pendingFeedback` once the restore succeeds.
- `PendingReviewScreen.swift`: "All items" toolbar item, `.sheet(item:)` for edit and for reject reason.
- `PendingReviewRows.swift`: `onEdit` closure and button on `PendingReviewBitRow`.
- `DueReviewModel.swift` (295 lines): only change `private(set) var current` to `var current` so the extension in another file can replace it. No added lines.
- `DueReviewScreen.swift` (267 lines): one `@State` for the sheet, one toolbar item, one `.sheet`; stays under 300.

## Edge cases
- Rapid filter changes: previous load task is cancelled; a stale response is ignored by comparing a request token.
- Bulk selection that includes items removed elsewhere: they return as `not_found` skips and are removed locally.
- Moving items placed in a course: skipped as `curriculum_placed`, labelled "placed in a course".
- Editing the due card while a grade is queued offline: the edit needs the network; offline shows the offline message and changes nothing.
- Suspend on a `new` item with no schedule row works server-side (schedule row is created, `knowledge-bit-review-suspension.orchestrator.ts:38-57`).

## Verification
No test target. `xcodegen generate`, then the usual simulator `xcodebuild` exits 0. Manual: list matches web Knowledge page for the same subject and search; suspend shows in the Suspended list and "Bring back" removes it; deleting 2 items removes them on web; moving to another subject updates web; rejecting a pending item and picking a reason shows it on web admin feedback; editing a due card changes its text on web.

## Defaults
- "Course" filter means subject: the overview filters by subject only, and courses sit under subjects in the Courses tab.
- Knowledge list entry in the Review tab toolbar keeps `HomeView.swift`, `HomeScreen.swift` and `CoursesScreen.swift` free for the other plans.
- Status filter in memory, Suspended via its own list.
- Text editing offered where variant ids exist (Review tab, Due card) instead of the list.
- Move reloads page one; delete removes locally.
- Reason prompt as an optional sheet ("Skip" sends nothing), so rejecting stays one tap.
