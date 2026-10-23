# Progress: Home summary, Progress tab, course stats

## Goal
Covers the three coding tasks in `.planning/progress/todo.md`:
1. Home opens with today's summary and the study streak.
2. A new Progress tab shows milestones, retention and the weekly digest.
3. A course's screen shows that course's stats.

Read-only feature: six GET calls, no writes. No server change.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-408`, 401 `unauthorized`), so every screen handles `APIError.unauthorized`. Errors come as `{ "error": "<code>" }` (`apps/api/src/shared/http.ts:15-22`). Dates are ISO strings from `toISOString()` (with fractional seconds) unless noted.

| Call | Wired | Response |
|---|---|---|
| `GET /home/summary` | `apps/api/src/router-table.ts:401`, `apps/api/src/api-server.ts:710`, `apps/api/src/home/home.controller.ts:5-9` | `HomeSummary` |
| `GET /streak` | `apps/api/src/router-table.ts:400`, `apps/api/src/api-server.ts:708`, `apps/api/src/streak/streak.controller.ts:5-9` | `Streak` |
| `GET /milestones` | `apps/api/src/router-table.ts:686`, `apps/api/src/api-server.ts:886`, `apps/api/src/milestone/milestone.controller.ts:10-16` | `[Milestone]` (bare array) |
| `GET /analytics/retention` | `apps/api/src/router-table.ts:684`, `apps/api/src/api-server.ts:847`, `apps/api/src/analytics/analytics.controller.ts:11-15` | `RetentionReport` |
| `GET /analytics/digest` | `apps/api/src/router-table.ts:685`, `apps/api/src/api-server.ts:849`, `apps/api/src/analytics/analytics.controller.ts:17-21` | `WeeklyDigest` |
| `GET /curricula/:id/stats` | `apps/api/src/router-table.ts:388-392`, `apps/api/src/api-server.ts:704`, `apps/api/src/stats/stats.controller.ts:9-21` | `CurriculumStats`, 404 `not_found` |

No query params or bodies on any of them.

Shapes (`packages/shared/src`):
- `HomeSummary` (`home.ts:3-24`): `{ topSubjects: [{ subjectId, subjectName, lastInteractedAt: string, topicsTouchedLast30Days: int }], funStats: { currentStreak, longestStreak, topicsMastered, questionsAnswered: int } }`. Assembled in `apps/api/src/home/home.service.ts:9-26`.
- `Streak` (`streak.ts:3-7`): `{ currentStreak: int, longestStreak: int, lastActiveDate: string | null }`. Quirk: `lastActiveDate` is a date-only `YYYY-MM-DD` cut from a UTC ISO time (`apps/api/src/streak/streak.service.ts:5-7`), so "studied today" compares against today's UTC date, not the local date.
- `Milestone` (`milestone.ts:24-32`): `{ id, entityType: "curriculum" | "domain_node", entityId, entityLabel: string | null, criteriaKey: string, achievedAt: string, createdAt: string }`. `entityLabel` is null when the course or area was deleted. `criteriaKey` is an open string; only `"full_mastery"` ships (`milestone.ts:7-13`). Quirk: this GET awards new milestones as a side effect (`milestone.controller.ts:5-11`); harmless to call on every Progress open.
- `RetentionReport` (`analytics.ts:45-50`): `{ overall: RetentionSummary | null, timeToMasteryOverall: TimeToMasterySummary | null, byTopic: [Entry], byArea: [Entry] }`. `RetentionSummary` = `{ count: int, avgRate: number, medianRate: number }` with rate as a 0-1 fraction (web shows `avgRate * 100`, `apps/web/src/analytics/digest-format.ts:11-17`). `TimeToMasterySummary` = `{ count: int, avgHours: number, medianHours: number }`. `Entry` = `{ key: string, timeToMastery?, retention? }`, both nullable.
- `WeeklyDigest` (`analytics.ts:54-61`): `{ windowDays: int, timeToMastery: TTM | null, retention: RetentionSummary | null, coverage: [CoverageArea], concerns: [ConcernSummary], streak: Streak }`. `CoverageArea` (`analytics.ts:23-29`) = `{ domainNodeId, name, subjectName, percent: int, status: "gap" | "progress" }`. `ConcernSummary` (`concern.ts:23-28`) = `{ concern: enum, open, covered, total: int }`, concern one of `security, performance, observability, cost, reliability, developer_experience` (`concern.ts:3-10`).
- `CurriculumStats` (`stats.ts:30-38`): `{ curriculumId, attemptedTopicCount: int, weakSpots: [{ topicId, topicTitle, maturity: int 0-100, openGapLabels: [string] }], strongPoints: [{ topicId, topicTitle, maturity }], recommendationsEligible: bool, recommendations: [{ topicId, text, citations: [string], generatedAt: string }], nextStep }`. `nextStep` (`next-step.ts:4-17`) is nullable and is either `{ kind: "next_level", curriculumId, level: "basic"|"medium"|"advanced", topicId }` or `{ kind: "different_topic", topicId }`. 404 `not_found` when the course is gone (`stats.service.ts:56-60`).

## Dropped
- Per-topic and per-area retention breakdown (`byTopic`, `byArea`): `key` is a raw topic or area ID, not a name (`packages/core/src/analytics/mastery-breakdown.ts:57-90`); the web table prints the ID (`apps/web/src/analytics/mastery-breakdown-table.tsx:33-34`). Only the overall numbers are shown.
- `POST /curricula/:id/stats/recommendations` (generating new recommendations): an AI write, not in the todo.

## Files
New (all under `Sources/PostAnkiIOS/`):
- `API/ProgressModels.swift` (~130 lines): structs below plus a `ProgressLoadError` mapper.
- `API/APIClient+Progress.swift` (~35 lines): `homeSummary()`, `streak()`, `milestones()`, `retentionReport()`, `weeklyDigest()`, `curriculumStats(id:)`, each `try await request(...)`.
- `HomeSummarySection.swift` (~120 lines): `HomeSummaryModel` and `HomeSummarySection` view.
- `ProgressScreen.swift` (~150 lines): `ProgressModel` and the tab screen.
- `ProgressRows.swift` (~120 lines): milestone row, digest tiles, coverage row, concern row.
- `CurriculumStatsSection.swift` (~140 lines): `CurriculumStatsModel`, the compact section, and `CurriculumStatsScreen` (full list).

Changed (shared, see "Shared files"): `HomeView.swift`, `HomeScreen.swift`, `CoursesScreen.swift` (only `CurriculumDetailScreen`).

## Swift models (`API/ProgressModels.swift`)
All `Decodable, Sendable, Hashable`; plain `String` for dates; optional for every nullable field.
- `HomeSummary { topSubjects: [TopSubject]; funStats: HomeFunStats }`, `TopSubject { subjectId, subjectName, lastInteractedAt: String, topicsTouchedLast30Days: Int }` (`Identifiable` via `subjectId`), `HomeFunStats { currentStreak, longestStreak, topicsMastered, questionsAnswered: Int }`.
- `Streak { currentStreak, longestStreak: Int; lastActiveDate: String? }` with `var isActiveToday: Bool` comparing to today's UTC `yyyy-MM-dd`.
- `Milestone { id, entityType: String, entityId: String, entityLabel: String?, criteriaKey: String, achievedAt: String, createdAt: String }`. `entityType`/`criteriaKey` stay `String` so a new server value never breaks decoding; display maps known values and falls back to "Milestone".
- `RetentionSummary { count: Int; avgRate, medianRate: Double }`, `TimeToMasterySummary { count: Int; avgHours, medianHours: Double }`, `RetentionReport { overall: RetentionSummary?; timeToMasteryOverall: TimeToMasterySummary? }` (breakdown arrays not declared, ignored by the decoder).
- `CoverageArea { domainNodeId, name, subjectName: String; percent: Int; status: String }`, `ConcernSummary { concern: String; open, covered, total: Int }`, `WeeklyDigest { windowDays: Int; timeToMastery: TimeToMasterySummary?; retention: RetentionSummary?; coverage: [CoverageArea]; concerns: [ConcernSummary]; streak: Streak }`.
- `WeakSpot { topicId, topicTitle: String; maturity: Int; openGapLabels: [String] }`, `StrongPoint { topicId, topicTitle: String; maturity: Int }`, `TopicRecommendation { topicId, text: String; citations: [String]; generatedAt: String }`, `NextStep { kind: String; topicId: String; level: String? }` (one flat struct decodes both union arms), `CurriculumStats { curriculumId: String; attemptedTopicCount: Int; weakSpots; strongPoints; recommendationsEligible: Bool; recommendations; nextStep: NextStep? }`.
- `enum ProgressLoadError { offline, unauthorized, notFound, other }` with `static func from(_ error: Error) -> ProgressLoadError?` (nil for `CancellationError` and `URLError.cancelled`) and `var message: String`. Mirrors `PendingReviewListModel.message(for:)`; kept feature-local so the three plans share no new file.
- Formatting helpers in the same file: `RetentionSummary.percentText` (`"\(Int((avgRate*100).rounded()))%"`), `TimeToMasterySummary.hoursText` (`avgHours` to one decimal, "h"). Relative dates reuse the existing `DueReviewModel.nextDueText(_:)` read-only.

## Screens and behaviour

### 1. Home summary (`HomeSummarySection.swift`)
- `@MainActor @Observable final class HomeSummaryModel`: `summary: HomeSummary?`, `streak: Streak?`, `failure: ProgressLoadError?`, `isLoading`. `load()` guards re-entry, fetches both calls in parallel with `async let`, keeps the last good values on failure.
- `HomeSummarySection(model:)` renders a `Section("Today")`:
  - Streak line: flame icon, "N-day streak" (best M). If `streak.isActiveToday` is false and `currentStreak > 0`: caption "Study today to keep it going". `currentStreak == 0`: "Start a streak today".
  - Stats row: `questionsAnswered` "answered", `topicsMastered` "topics mastered".
  - Up to 3 `topSubjects`: name and "N topics this month".
  - States: first load shows a `ProgressView` row; failure without data shows the error message in secondary style (unauthorized says "Add your access token in Settings"); failure with data keeps the data silently. Empty `topSubjects` hides that part.
- Placed above the existing Due today section; it loads on the Home `.task` and on pull to refresh.

### 2. Progress tab (`ProgressScreen.swift`, `ProgressRows.swift`)
- `ProgressModel`: `milestones: [Milestone]`, `retention: RetentionReport?`, `digest: WeeklyDigest?`, `hasLoaded`, `failure`. `load()` runs the three calls together with `async let`; each result is captured separately so one failed call does not blank the others (per-section error text, page-level error only when all three fail on first load).
- Screen is its own `NavigationStack` with title "Progress", `List`, `.task { load }`, `.refreshable { load }`:
  - Section "This week" (digest): tiles for retention (`percentText` + count), time to mastery (`hoursText`), streak, average coverage (mean of `coverage.percent`). A null summary or `count == 0` shows "No data yet".
  - Section "Coverage": each area as name, subject name, percent with a `ProgressView(value:)`; status `gap` tinted orange. Hidden when empty.
  - Section "Concerns": only rows with `total > 0`, label from the concern key (underscores to spaces, capitalised), "covered / total".
  - Section "Retention (all time)": overall avg/median retention and avg/median hours to mastery.
  - Section "Milestones": newest `achievedAt` first; row shows `entityLabel ?? "Deleted course"`, a kind label ("Course mastered" / "Area mastered"), relative date. Empty: `ContentUnavailableView("No milestones yet", systemImage: "trophy", description: "Master every topic in a course to earn one.")`.
  - First load: full-screen `ProgressView`. All three fail before any data: `ContentUnavailableView` with the error message and a "Try again" button (same pattern as `PendingReviewScreen.swift`).

### 3. Course stats (`CurriculumStatsSection.swift`)
- `CurriculumStatsModel`: `stats: CurriculumStats?`, `failure`, `load(curriculumId:)`. 404 maps to `.notFound` with "Stats aren't available for this course."
- `CurriculumStatsSection(model:, topics: [Topic])` is a `Section("Your progress")` at the top of the course screen:
  - "N topics practised" (`attemptedTopicCount`). Zero: "Practise a topic to see stats here."
  - Up to 3 weak spots: title, maturity %, first gap label as caption.
  - Next step: if `nextStep.topicId` is in this course's `topics`, a `NavigationLink` "Next: <title>" to `ExerciseScreen(topics: [topic])`; otherwise hidden (a `next_level` step may point into another course).
  - "See all stats" `NavigationLink` to `CurriculumStatsScreen(model:)`, shown when there is anything beyond the first three.
  - Loading: inline `ProgressView`; failure: secondary error text.
- `CurriculumStatsScreen`: sections Weak spots (all, with every gap label), Strong points, Recommendations (shown only when `recommendationsEligible`; each `text`, with the topic title looked up from weak spots, relative `generatedAt`). Pull to refresh reloads the shared model.

## Shared files (edits owned by this plan)
Re-read each file right before editing; targeted `Edit`, never a rewrite.
- `HomeView.swift` (owned only by this plan): add `ProgressScreen().tabItem { Label("Progress", systemImage: "chart.bar") }` and reorder tabs to Home, Courses, Review, Progress, Ingest, Inbox. With six tabs iOS moves the last two into its "More" tab; Review (with its badge) and Progress stay visible.
- `HomeScreen.swift` (shared with study-tools, separate hunks): (a) add `@State private var summaryModel = HomeSummaryModel()` under `dueModel`; (b) insert `HomeSummarySection(model: summaryModel)` as the first child of the `List`, above `Section { DueTodayRow(model: dueModel) }`; (c) in `.refreshable`, add `async let summary: Void = summaryModel.load()` and `await summary`; (d) change `.task { await model.load() }` to also load `summaryModel` in parallel. Do not touch the "Add knowledge" section or anything below it (study-tools inserts there).
- `CoursesScreen.swift` (shared with study-tools, separate structs): edits only inside `CurriculumDetailScreen`: add `@State private var statsModel = CurriculumStatsModel()`; insert `CurriculumStatsSection(model: statsModel, topics: model.detail?.modules.flatMap(\.topics) ?? [])` as the first child of its `List`; in `.refreshable` and `.task` also call `statsModel.load(curriculumId: curriculum.id)` in parallel. `CoursesScreen`, `CurriculumDetailScreenModel` and `TopicRow` stay untouched (study-tools edits `TopicRow`).

## Edge cases
- Pull to refresh while a load runs: the model's `isLoading` guard drops the second call.
- Streak "today" uses the UTC date like the server; late-evening local study can read as "tomorrow" on the server. Accepted, matches web.
- Milestone with deleted course: "Deleted course" label, still listed.
- Unknown `entityType`, `criteriaKey`, `status` or `concern` strings render with a generic label, never crash.
- Course with no attempts: weak spots and recommendations empty, section shows the zero copy.

## Verification
No test target (`project.yml`). `xcodegen generate`, then the project's usual `xcodebuild` simulator build exits 0. Manual: Home shows streak and counts matching the web dashboard; Progress tab numbers match the web analytics page; a course with practice shows weak spots; airplane mode shows the offline copy and keeps old numbers on refresh; a wrong token shows the Settings hint.

## Defaults
- Progress as a real tab (todo wording) with Ingest and Inbox moved behind iOS "More", so Review's badge stays visible.
- Both `/home/summary` and `/streak` are called: summary has the counts, only `/streak` has `lastActiveDate` for the "studied today" hint.
- Retention breakdown dropped (IDs only); overall numbers shown.
- Feature-local error mapper and date reuse of `DueReviewModel.nextDueText` keep the three plans free of a shared new file.
- Course stats inline as a compact section plus a "See all" screen rather than a separate tab.
