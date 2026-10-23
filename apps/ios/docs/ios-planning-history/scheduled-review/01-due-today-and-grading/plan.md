# Plan: Due today screen + reveal and grade (todo items 1 and 2)

## Goal
A pushed SwiftUI screen "Due today" that loads the review cards due now, shows one card at a time (prompt, Show answer, answer, four grade buttons) and records each grade on the server, refetching when the batch runs out.

## Behaviour
- Load: `GET /knowledge-bits/review-cards?limit=20&tz=<TimeZone.current.identifier>`. Show the first card; keep the rest in a queue.
- Card: prompt (kind `fill_in_the_blank`: replace `____` with `[...]`, as the web does). Button "Show answer". After reveal: answer, then `background` if non-nil (web shows background only after reveal), then four buttons Again / Hard / Good / Easy (plain labels; item 3 adds interval text).
- Grade: `POST /knowledge-bits/reviews` body `{variantId, grade, durationMs, requestId}`. `requestId` = `UUID().uuidString.lowercased()`, fresh per attempt. `durationMs` = ms from the card first being shown (web parity, `anki-review-session-actions.ts:99`), clamped 0...86_400_000, measured with `ContinuousClock`.
- On success: remember the `RecordReviewResult` (keep `reviewId` for item 4), drop the card, show the next. When the queue is empty, show loading and refetch once. Empty result -> empty state.
- Empty state: nextDueAt non-nil -> "Done for today. Next card due <relative>" (`RelativeDateTimeFormatter`, ISO string parsed with fractional seconds, fallback without). nextDueAt nil and counts all zero and nothing graded this session -> "No cards to review yet. Approve suggested questions or add knowledge." nextDueAt nil otherwise -> "No more cards are scheduled." Show "N reviewed this session" when N > 0.
- States: `loading`, `card`, `empty`, `error(String)` with Retry, `unauthorized` (text pointing to Settings + `NavigationLink` to existing `SettingsScreen()`).
- Double-tap guard: `grade()` starts with `guard !isGrading, isRevealed, let card = current`, sets `isGrading = true` synchronously before the first `await`, resets in `defer`. All four buttons use `.disabled(model.isGrading)`. `reveal()` is idempotent.
- Retry identity: remember `pendingAttempt {variantId, grade, requestId}`. Same card + same grade after a failure reuses the SAME `requestId` (server replays the stored result, `knowledge-bit-review.orchestrator.ts:67-72`). A different grade, or a new card, gets a new id (web parity). Cleared on success.

## Edge cases
- 403 `not_approved` / 404 `variant_not_found` (`APIError.badStatus(403|404, code)`; `knowledge-bit-review.controller.ts:48-52`): drop the card, add `variantId` to `skippedVariantIds`, show a short notice "Skipped a card that is no longer available", move on. Refetched cards in `skippedVariantIds` are filtered out; if nothing is left, show the empty state (prevents a refetch loop).
- Network / 5xx / other grade error: keep the card revealed, show "Couldn't save that." with a Retry button that re-sends with the same `requestId`. No local queue (item 5 replaces this path).
- 401 on grade: same as above with text "Your session expired. Update your token in Settings, then retry." 401 on load: `unauthorized` state.
- 400 `invalid_input` on grade: treat as a generic error (keeps card, Retry).
- `CancellationError` / `URLError.cancelled` from the `.task` ending: ignore, no error state.
- Refetch failure after the last card: `error` state with Retry that reloads.

## API contract (server, read only)
- `apps/api/src/router-table.ts:84` GET review-cards, `:99` POST reviews. Controller `apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:14-33` (list, 200) and `:35-57` (record, 201; 403 not_approved, 404 variant_not_found, 400 invalid_input).
- Schemas: `packages/shared/src/knowledge-bit-review.ts` (query :24-31, card :52-62, response :66-71, record input :75-80, result :84-93). `limit` 1..50.

## Files (all ours; nothing else is touched)
1. `Sources/PostAnkiIOS/API/ScheduledReviewModels.swift` (new)
2. `Sources/PostAnkiIOS/API/APIClient+ScheduledReview.swift` (new)
3. `Sources/PostAnkiIOS/DueReviewModel.swift` (new, `@MainActor @Observable final class DueReviewModel`)
4. `Sources/PostAnkiIOS/DueReviewScreen.swift` (new, views only)

No entry point yet: the Home card is item 6. The screen is verified through the build and a `#Preview`.

## Steps
1. `ScheduledReviewModels.swift`. JSON keys exactly as the Zod schemas; no CodingKeys needed (Swift names equal JSON keys). Dates stay `String`.
   - `enum ReviewGrade: String, Codable, CaseIterable, Sendable { again, hard, good, easy }`
   - `struct IntervalPreview: Codable, Hashable, Sendable { again, hard, good, easy: Int }`
   - `struct ReviewCounts: Codable, Hashable, Sendable { new, learning, review: Int }`
   - `struct ReviewCard: Codable, Identifiable, Hashable, Sendable { variantId, knowledgeBitId, kind: String, prompt, answer: String, background: String?, phase: String, leech: Bool, intervalPreview: IntervalPreview; var id: String { variantId } }`
   - `struct ReviewCardsResponse: Codable, Sendable { cards: [ReviewCard], counts: ReviewCounts, newRemainingToday: Int, nextDueAt: String? }`
   - `struct RecordReviewInput: Encodable, Sendable { variantId: String, grade: ReviewGrade, durationMs: Int?, requestId: String? }` (synthesized encoding omits nil).
   - `struct RecordReviewResult: Codable, Sendable { reviewId, knowledgeBitId: String, phase: String, dueAt: String, intervalDays: Double, lapses: Int, leech: Bool, suspended: Bool }`
2. `APIClient+ScheduledReview.swift`: `extension APIClient` with
   - `static func reviewCards(limit: Int = 20, tz: String) async throws -> ReviewCardsResponse`: build the path with `URLComponents` + `URLQueryItem` (limit, tz) so the `/` in the zone name is encoded correctly, then call `request`.
   - `static func recordReview(_ input: RecordReviewInput) async throws -> RecordReviewResult`: `request("/knowledge-bits/reviews", method: "POST", body: input)`.
3. `DueReviewModel.swift`:
   - `enum LoadState { loading, card, empty, error(String), unauthorized }`, `state`, `current: ReviewCard?`, `queue: [ReviewCard]`, `isRevealed`, `isGrading`, `gradeError: String?`, `notice: String?`, `nextDueAt: String?`, `noCardsYet: Bool`, `reviewedCount`, `lastGraded: GradedCard?` (card, grade, reviewId, requestId; for item 4), private `shownAt: ContinuousClock.Instant`, `pendingAttempt`, `skippedVariantIds`.
   - `load()`: set `.loading`, call `reviewCards`, filter skipped ids, fill queue, `showNext()`; map errors as in Edge cases.
   - `reveal()`, `grade(_:)` (guard, build attempt, `durationMs`, call a single private `submit(_ input:)` seam so item 5 can swap it, handle outcomes), `showNext()` (pop queue, reset `isRevealed`, `gradeError`, `shownAt`; empty queue -> `load()` once, then `.empty`).
   - Pure helpers kept `static`/`nonisolated` for later unit tests: `durationMs(elapsed:)`, `nextDueText(_:now:)`, `displayPrompt(_:)`.
4. `DueReviewScreen.swift`: `struct DueReviewScreen: View` with `@State private var model = DueReviewModel()`, `.navigationTitle("Due today")`, `.task { await model.load() }`. Subviews as small private structs: card view, `DueReviewGradeButtons` (takes `isDisabled`, `onGrade`; one place for item 3 to add interval labels), empty/error/unauthorized views. Grade buttons call `Task { await model.grade(g) }`. Keep each file under 300 lines (split into `DueReviewViews.swift` if needed).
5. Build with the command in `scratchpad/context.md`; fix only errors in our own files.

## Tests
The repo has no test target and adding one means project.yml changes, which is out of scope. Behaviour is checked by the build plus a manual run against the dev API:
- Load returns cards; tapping Show answer then Good records one review (check the server) and advances.
- Rapid double tap on a grade button sends exactly one POST.
- Airplane mode on grade shows the error and Retry; after reconnecting Retry succeeds, and only one review exists server-side.
- Empty queue shows the right empty text for the three nextDueAt cases.
The static helpers in step 3 are written pure so a test target can cover them later.

## Done when
- Build exits 0 (own derived data path).
- Screen loads with `tz` and `limit=20`, shows prompt, answer after reveal, optional background, four grade buttons.
- Grade POSTs the exact keys `variantId, grade, durationMs, requestId` with a lowercase UUID; the card advances only on success.
- No second POST can start while one is in flight; Retry reuses the same `requestId`.
- 403/404 skips the card with a notice; empty, loading, error and unauthorized states render.
- `reviewId`, `intervalPreview` and a single `submit` seam are kept for items 3, 4 and 5; none of those is implemented.
- No file outside the four listed was modified; no token or response body is logged.

## Defaults chosen
- `kind` and `phase` decoded as `String`, not enums: a new server value must not break decoding of the whole batch.
- `durationMs` measured from the card being shown, not from reveal: matches the web client.
- Background shown only after reveal: matches the web client.
- Batch limit 20 (the web uses 10): fewer refetches on mobile; the server accepts 1..50.
- Lowercase UUID string for `requestId`: stable across Zod versions and the unique column.
- 403/404 auto-skips with a notice instead of a "Skip" button: less friction on mobile; the skipped-id filter guards against a loop.
- Different grade after a failed one gets a new `requestId`: web parity, accepted risk that a lost-response success could double-record.
- Unauthorized on grade keeps the card and offers Retry rather than discarding it.
- No Home entry point or tests here: Home card is item 6, no test target exists.

END-OF-REPORT
