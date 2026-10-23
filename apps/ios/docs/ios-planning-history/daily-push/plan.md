# Daily push and due queue: start-of-day screen

## Goal
Covers the single coding task in `.planning/daily-push/todo.md`: when the learner opens the app, Home shows a "Start your day" card with today's one picked gap (which topic, which course, why it was picked) and opens a screen where they answer that one question, then see the rest of today's due queue. Mirrors the server's daily push and due queue, which the Telegram bot and web use for the same purpose.

Batch A, built first. This plan creates the batch-A Home hub file (`HomeDailySection.swift`) that search, source-library and notion-import add rows to.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-410`, 401 `unauthorized`). Errors are `{ "error": "<code>" }`; unhandled throws are 500 `internal_error` (`api-server.ts:411-418`).

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /daily-push?mode=socratic` | `apps/api/src/router-table.ts:310`, `api-server.ts:643-648`, `apps/api/src/push/push.controller.ts:20-50` | query `mode` (`"socratic"`/`"quick_test"`, anything else falls back to socratic, `push.controller.ts:25-26`), optional `subjectId` | `DailyPushResponse { push: DailyPush?, question: ProbeQuestion?, nudge: DailyPushNudge? }` (`packages/shared/src/daily-push.ts:36-40`) | none |
| `GET /due-queue` | `router-table.ts:311`, `api-server.ts:649-650`, `push.controller.ts:52-60` | none | `{ items: [DailyPush] }` (`daily-push.ts:48-50`) | none |
| `POST /topics/:id/probe/answer` | `router-table.ts:278`, `api-server.ts:610-611`, `apps/api/src/probe/probe.controller.ts:34-54` | `{ gapId: String?, mode: "socratic", answer }` (`packages/shared/src/probe.ts:31-37`) | `ProbeResult { outcome: "pass"|"fail", coveredGapLabels, feedback, ... }` (`probe.ts:41-48`) | 400 `invalid_input`, 404 |

Shapes:
- `DailyPush` (`daily-push.ts:10-17`): `{ topicId, topicTitle, curriculumId, curriculumName, gap: Gap, reason: "important"|"wanted"|"weakest"|"refresh" }`. Only `gap.id` and `gap.label` are needed (`packages/shared/src/gap.ts:73-80`).
- `ProbeQuestion` (`probe.ts:7-20`): `{ gapId: String?, gapLabel: String?, kind, prompt, options: [String]?, sources: [String]?, correctAnswerIndex: Int? }`.
- `push` is null when nothing is due; `question` is null whenever `push` is null (`push.controller.ts:37-39`).

## Dropped
- `nudge` in the daily-push response and `POST /nudge-responses` (`router-table.ts:631`): a "still interested in X?" reply to a bot reminder, not part of the start-of-day screen in the todo.
- `?subjectId=` filter: one daily pick across everything, as the bot sends it.
- Quick-test mode for the daily question: the existing answer call the app already has sends socratic mode only; a quick test on a topic already lives in the topic hub.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `DailyPush*` and `DueQueue*`:
- `API/DailyPushModels.swift` (~50 lines): `DailyPushResponse`, `DailyPushPick`, `DailyPushGap { id; label }`, `DailyPushQuestion`, `DueQueueResponse { items: [DailyPushPick] }`. `Decodable, Sendable, Hashable`; nullable fields as optionals.
- `API/APIClient+DailyPush.swift` (~25 lines): `dailyPush()`, `dueQueue()`.
- `DailyPushModel.swift` (~110 lines), `DailyPushScreen.swift` (~150 lines).
- `HomeDailySection.swift` (~60 lines): batch-A Home hub. Holds the "Start your day" card; later batch-A plans add their rows in a second `Section("Find and import")` inside this file.

Read-only reuse (no edits): `APIClient.answerTopicProbe(topicId:gapId:answer:selfOutcome:)` and `TopicProbeResult` from `API/APIClient+StudySessions.swift` (already sends `mode: "socratic"`), `StudyToolsError.message(for:notFound:)`, `TopicStudyScreen(topic:)`, `APIClient.getCurriculumDetail`.

## Screens and behaviour
- Entry: `HomeDailySection()` placed right below the existing due-cards row on Home. Its card loads `dailyPush()` once per appearance and shows: "Start your day", topic title, course name, and a reason chip ("Marked important", "You wanted this", "Your weakest spot", "Due a refresh"). Tap pushes `DailyPushScreen`. When `push` is null: "Nothing picked for today. You're up to date." with a "See due queue" link to the same screen. Loading shows a small spinner in the row; an error shows one line and a retry button in the row.
- `DailyPushScreen` (`@MainActor @Observable DailyPushModel`): loads `dailyPush()` and `dueQueue()` in parallel.
  - Section "Today's question": topic and course names, gap label, prompt. A multi-line answer field and "Submit" (disabled while blank or submitting). On success shows feedback and a pass/fail label and covered gap labels; the field locks. "Open topic" pushes `TopicStudyScreen` after looking up the topic in `getCurriculumDetail(curriculumId)`; if the topic is gone, "Couldn't open this topic."
  - If `question` is null but `push` is set, show the gap label with "Open topic" only.
  - Section "Due queue": rows from `items` (topic title, course name, gap label, reason chip), each with the same "open topic" lookup. Empty: "Nothing else is due."
  - Pull to refresh reloads both calls and clears an answered question.
- States: spinner on first load, error with "Try again", offline message from `StudyToolsError`.

## Shared files
Re-read before editing; one added line via targeted `Edit`.
- `Sources/PostAnkiIOS/HomeScreen.swift`: add `HomeDailySection()` on the line after `Section { DueTodayRow(model: dueModel) }` (currently line 46). No other batch edits this file.

## Edge cases
- The daily pick rotates on the server by time; reloading may show a different gap. The screen keeps the answered result until pull to refresh.
- Answer call 404 (topic deleted since load): "This topic was removed." and reload.
- A due-queue item equal to today's pick is shown once (skip items whose `gap.id` equals the pick's).

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: Home shows the card with a topic; answer it and see feedback; the due queue matches web/bot for the same account.

## Defaults
- "Start-of-day screen" is the card at the top of Home rather than a modal that pops up on launch; no new tab and no auto-presentation.
- Socratic mode only; free-text answers.
- Nothing is queued offline.
