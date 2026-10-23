# 06 Home due-today card

## Goal
Home shows a "Due today" row with the number of reviews waiting, tapping it opens `DueReviewScreen()`.

## Count source (decided)
Use `GET /knowledge-bits/review-cards?limit=1&tz=<IANA>` and read only `counts` (total = review + learning + new).
- Fact: `/subjects/review-due-counts` rolls each subject up over its subtree (`apps/api/src/knowledge-bit/subject-review-due-counts.repo.ts:66-84`), so summing `subjects[]` double-counts nested subjects. The response carries no `parentId`, so the client cannot pick top-level ones without a second call (`GET /subjects`). Its `dueCount` also has no learning/learn-ahead split and does not match what a session serves.
- Fact: the web sidebar does exactly that sum (`apps/web/src/nav/sidebar.tsx:60-63`) and shows `newRemainingToday` separately; we do not copy that over-count.
- Fact: `review-cards` unscoped counts come from the same eligible set the Due screen serves: `new` is capped by `remaining` (`apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts:106-110`), `review` = due non-learning, `learning` includes the learn-ahead window (`knowledge-bit-review-queue-counts.repo.ts:17-19`). Counts do not depend on `limit`, so `limit=1` is the cheapest valid call.
- Route: `apps/api/src/router-table.ts:84`; `tz` validated as IANA, default UTC (`packages/shared/src/knowledge-bit-review.ts:26`). Send `TimeZone.current.identifier` via `URLComponents` so the new-card day boundary matches the device.
- Response decoded with our own tiny `Decodable` (`counts{new,learning,review}`, `nextDueAt: String?`); `cards` is ignored. This avoids depending on the other item's `ReviewCardsResponse` or API extension file.

## Approach
New file `Sources/PostAnkiIOS/DueTodayCard.swift` holds a `DueTodayCounts` struct, a small `@MainActor @Observable final class DueTodayModel`, and a `DueTodayRow` view. `HomeScreenModel` is not touched. `HomeScreen.swift` gets three small insertions; the "Add knowledge" Section (the other orchestrator's) and the toolbar are left alone. No new module, boundary or contract: one existing GET endpoint, one view, one model.

## Steps
1. Create `Sources/PostAnkiIOS/DueTodayCard.swift` (under ~120 lines):
   - `struct DueTodayCounts: Decodable { counts: Counts; nextDueAt: String? }`, `Counts { new, learning, review: Int }`, `var total: Int`.
   - `DueTodayModel`: `var counts: DueTodayCounts?`, `var state` (enum `idle | loading | failed(DueTodayFailure)`) where failure is `.offline`, `.unauthorized`, `.other`. `func load() async`: return if already loading; set loading; build path with `URLComponents` (`limit=1`, `tz`); `try await APIClient.request(path)`. On success set `counts`, state idle. On `CancellationError` or `URLError.cancelled` leave state untouched. On `APIError.unauthorized` -> `.unauthorized`. On other `URLError` -> `.offline`. Otherwise `.other`. Keep the last good `counts` on any failure.
   - `DueTodayRow(model:)`: `NavigationLink { DueReviewScreen() } label: { ... }` with title "Due today" and a trailing bold total. Subtitle `"R review, L learning, N new"` (omit zero parts). `.task { await model.load() }` inside the row so it re-runs each time Home re-appears after popping back from the Due screen.
2. Edit `Sources/PostAnkiIOS/HomeScreen.swift` (re-read immediately before editing, use targeted `Edit`, never rewrite the file):
   - Add `@State private var dueModel = DueTodayModel()` under `@State private var model`.
   - Insert `Section { DueTodayRow(model: dueModel) }` as the first child of the `List`, above `if let curriculumName`.
   - Change `.refreshable { await model.load() }` to load both: `async let` both loads, awaiting each.
3. Build with the command in `context.md` (own derived data). Foreign-file build errors: wait and retry, do not fix.

## States
- First load (no counts yet): row with "Due today" and a `ProgressView`; still tappable.
- Counts > 0: total plus breakdown.
- Total 0: "Nothing due today" with a checkmark icon, still a link (the Due screen shows `nextDueAt`/empty state). Not hidden, so Home layout does not jump.
- Failure with prior counts: keep showing them, no error text (avoid flicker on a flaky refresh).
- Failure without counts: `.offline` -> "Can't check offline"; `.unauthorized` -> "Add your access token in Settings"; `.other` -> "Couldn't load due reviews". Secondary style, row stays tappable.
- 401 does not trigger any global handling; Settings owns the token.

## Edge cases
- `.task` plus `.refreshable` overlap: the `loading` guard drops the second call.
- Grades queued offline but not yet flushed leave the count briefly high; it corrects on the next load.
- Home `.task` on the pop-back also reloads the last course; accepted.
- Count is not persisted across launches (no stale-number risk).

## Tests
No test target exists (`project.yml`), so none are added. Verification is the build plus manual: counts match the Due screen; airplane mode shows the offline text on a cold start and keeps the old number on refresh; a wrong token shows the Settings hint; grading cards then going back decrements the number.

## Done when
- Build exits 0.
- Home shows a Due today row linking to `DueReviewScreen()`.
- The number equals `counts.review + counts.learning + counts.new` from `review-cards` (new capped).
- Row refreshes on appear (including pop-back) and on pull-to-refresh.
- Zero, loading, offline, 401 and generic-error states render as specified.
- The "Add knowledge" Section and `HomeView.swift`/`APIClient.swift` are unchanged by this item.

## Defaults chosen
- `review-cards?limit=1` over `review-due-counts`: correct total with one call and no client-side tree logic.
- Separate `DueTodayModel` in our own file: fewest `HomeScreen.swift` edits, no conflict with `HomeScreenModel` changes.
- Own decode struct and request in our file: independent of the other item's file and type names.
- Show "Nothing due today" rather than hiding: stable layout, confirms the check ran.
- Keep last counts on failure and no persistence: simplest behavior that does not mislead.
- Section placed first in the List: highest-value item, and no overlap with the other orchestrator's Section.

END-OF-REPORT
