# Study sessions: plan, start, answer, end, consistency

## Goal
Covers the single coding task in `.planning/study-sessions/todo.md`: plan a timed study session (optionally focused on one course), start it, answer the questions it serves, end it, and see how consistently planned sessions get done. Mirrors web `apps/web/src/routes/study-sessions.tsx` and `apps/web/src/study-session/session-runner.tsx`.

Batch 1, built second. Creates the batch-1 Home section `HomeStudyModesSection.swift` that the gaps plan adds a row to.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/quiz-sessions/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /study-sessions` | `apps/api/src/router-table.ts:701`, `apps/api/src/`api-server.ts:851-870`, `apps/api/src/study-session/study-session.controller.ts:35-39` | none | `[StudySessionListItem]` newest first (`apps/api/src/study-session/study-session.repo.ts:54-58`) | none |
| `POST /study-sessions` | `router-table.ts:699`, `api-server.ts:851-870`, `study-session.controller.ts:19-33` | `{ targetType?: "curriculum"|null, targetId?: String?, plannedDurationMinutes: Int>0, scheduledFor?: ISO String? }` (`packages/shared/src/study-session.ts:34-39`) | **201** `StudySession` | 400 |
| `GET /study-sessions/consistency?windowDays=` | `router-table.ts:700`, `api-server.ts:851-870`, `study-session.controller.ts:150-160` | optional `windowDays` (default 30, `packages/core/src/study-session/session-consistency.ts:2`) | `{ planned: Int, completed: Int, rate: Double }` (`study-session.ts:62-66`) | none |
| `GET /study-sessions/:id` | `router-table.ts:728`, `api-server.ts:851-870`, `study-session.controller.ts:41-53` | none | `StudySession` | 404 `not_found` |
| `PATCH /study-sessions/:id/start` | `router-table.ts:710`, `api-server.ts:851-870`, `study-session.controller.ts:55-67` | no body | `StudySession` with `status: "in_progress"`, `startedAt` now. No status guard (`study-session.repo.ts:60-73`) | 404 |
| `GET /study-sessions/:id/push?excludeGapIds=a,b&mode=socratic` | `router-table.ts:704`, `api-server.ts:851-870`, `study-session.controller.ts:128-148` | comma list; `mode` defaults to `socratic` | `{ push: DailyPush?, question: ProbeQuestion? }` (`study-session.ts:55-58`) | 404 `not_found` |
| `POST /topics/:id/probe/answer` | `router-table.ts:272`, `api-server.ts:851-870`, `apps/api/src/probe/probe.controller.ts:34-54` | `{ gapId: String?, mode: "socratic", answer, selfOutcome?: "pass"|"fail" }` (`packages/shared/src/probe.ts:31`, topicId from path) | `ProbeResult` (`probe.ts:41`) | 404 `not_found`, 409 `not_confirmed`, 409 `gap_not_open` (`apps/api/src/probe/probe.service.ts:71,184-197`) |
| `PATCH /study-sessions/:id/answers` | `router-table.ts:722`, `api-server.ts:851-870`, `study-session.controller.ts:106-126` | `{ correct: Bool }` (`study-session.ts:43-45`) | `StudySession` with counters bumped | 404 |
| `PATCH /study-sessions/:id/end` | `router-table.ts:716`, `api-server.ts:851-870`, `study-session.controller.ts:69-104` | `{ userRequestedEnd?: Bool }` (`study-session.ts:49-51`) | `StudySession`. Unchanged unless time is up or `userRequestedEnd` (`packages/core/src/study-session/should-end-session.ts`); ends as `completed` when at least one answer was recorded, else `abandoned` (`study-session.repo.ts:87`) | 400, 404 |

Shapes:
- `StudySession` (`study-session.ts:18-30`): `{ id, targetType: "learning_path"|"domain_node"|"curriculum"|null, targetId?, plannedDurationMinutes, scheduledFor?, status: "planned"|"in_progress"|"completed"|"abandoned", startedAt?, completedAt?, questionsAnswered, questionsCorrect, createdAt }`. List items add `missed: Bool` (planned and `scheduledFor` in the past, `packages/core/src/study-session/is-session-missed.ts:1-11`).
- `DailyPush` (`packages/shared/src/daily-push.ts:10`): `{ topicId, topicTitle, curriculumId, curriculumName, gap: Gap, reason: "important"|"wanted"|"weakest"|"refresh" }`. Only `gap.id` and `gap.label` are read here (`packages/shared/src/gap.ts:71-93`).
- `ProbeQuestion` (`probe.ts:7-20`): `{ gapId?, gapLabel?, kind: "socratic"|"quick_test", prompt, options: [String]?, sources: [String]?, correctAnswerIndex: Int? }`.
- `ProbeResult`: `{ outcome: "pass"|"fail", coveredGapLabels: [String], feedback, progress: { status, maturity, attempts, lastInteractedAt? }, learningStatus, nextQuestion: ProbeQuestion? }` (`probe.ts:41`).
- Answer flow on web: a free-text answer plus self-grade "I answered it well" / "I struggled" (`apps/web/src/curriculum/probe-answer.tsx:166-177`); when the question has options, the outcome is computed locally from `correctAnswerIndex` and sent as `selfOutcome` (`probe-answer.tsx:101`). Then the session counter is bumped with `correct = outcome == "pass"` and the gap is excluded from the next push (`apps/web/src/study-session/session-runner.tsx:38-63`).

## Dropped
- Learning-path and domain-area targets when planning: learning paths belong to batch 2's learning-list plan and domain areas have no iOS screen. Existing sessions with those targets still list with the label "Learning path" / "Area".
- The nudge panel shown during a web session: not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/StudySessionModels.swift` (~100 lines): `StudySession`, `StudySessionListItem`, `StudySessionConsistency`, `CreateStudySessionInput`, `StudySessionPush { push: StudyPushTarget?; question: StudyPushQuestion? }`, `StudyPushTarget { topicId, topicTitle, curriculumId, curriculumName, gap: StudyPushGap, reason }`, `StudyPushGap { id, label }`, `StudyPushQuestion`, `TopicProbeAnswerInput`, `TopicProbeResult`, `RecordSessionAnswerInput`, `EndStudySessionInput`. The full `Gap` type is reserved for the gaps plan.
- `API/APIClient+StudySessions.swift` (~80 lines): `studySessions()`, `createStudySession(_:)`, `studySessionConsistency()`, `studySession(id:)`, `startStudySession(id:)`, `studySessionPush(id:excludeGapIds:)`, `answerTopicProbe(topicId:gapId:answer:selfOutcome:)`, `recordStudySessionAnswer(id:correct:)`, `endStudySession(id:userRequestedEnd:)`. Own file-private path helpers.
- `StudySessionsModel.swift` (~100 lines), `StudySessionsScreen.swift` (~150 lines): list, consistency, plan sheet.
- `PlanStudySessionSheet.swift` (~100 lines).
- `StudySessionRunModel.swift` (~140 lines), `StudySessionRunScreen.swift` (~180 lines): planned, running, review states.

## Screens and behaviour

### Entry
- New `HomeStudyModesSection.swift` (~25 lines): `Section("Study sessions and gaps")` with its first row, "Study sessions" (`timer`).

### Sessions list (`StudySessionsScreen`)
- Header card: "Last 30 days: completed of planned sessions done (rate%)" from consistency; `planned == 0` shows "No sessions planned in the last 30 days."
- Sections "Upcoming" (planned, not missed, soonest `scheduledFor` first, unscheduled last), "In progress", "Missed" (`missed`), "Done" (completed or abandoned, newest first).
- Row: target label ("Anything", course name from `listCurricula()`, "Learning path", "Area"), "20 min", scheduled time via `DueReviewModel.nextDueText(_:)`, and for done rows "answered, correct" counts. Tap pushes `StudySessionRunScreen(sessionId:)`.
- Toolbar "+" opens `PlanStudySessionSheet`.
- States: spinner on first load; failure `ContentUnavailableView` with "Try again"; empty "No study sessions yet. Tap + to plan one."; pull to refresh reloads list and consistency in parallel (`async let`).

### Plan sheet (`PlanStudySessionSheet`)
- Focus picker: "Anything" or one course (from `listCurricula()`); duration stepper 5-120 min in 5s, default 20 (web default, `apps/web/src/study-session/schedule-form.tsx:29`); optional "Schedule for" date picker (off by default). Copy: "A planned time is just a reminder to yourself."
- "Plan" posts; success inserts the session and offers "Start now" (pushes the run screen). Failure keeps the form and shows "Couldn't plan that session. Try again."

### Running a session (`StudySessionRunModel`, `StudySessionRunScreen`)
- Load GET `/study-sessions/:id`. By status:
  - `planned`: summary and "Start session" (PATCH start).
  - `in_progress`: runner.
  - `completed`/`abandoned`: review card: duration, answered, correct, percent; "Abandoned: no questions answered." for abandoned.
- Runner: a timer banner "12m of 20 min" updated every second by a `TimelineView(.periodic)`; when elapsed reaches the plan it shows "Time's up" and an "End session" button (PATCH end without `userRequestedEnd`). A toolbar "End now" always sends `userRequestedEnd: true` after a confirm dialog.
- Question card: "curriculumName - topicTitle", gap label in bold, the question prompt. If `question.options` exists: option buttons, outcome computed locally, then posted with `selfOutcome`. Otherwise a multiline answer field and two buttons "I answered it well" / "I struggled".
- After the probe answer returns: show `feedback` and covered gaps ("Covered: ..."), PATCH answers with `correct`, add the gap id to `excludeGapIds`, then "Next" loads the next push.
- `push == nil`: "Nothing to study for this focus right now." with "End session". `question == nil` with a push: "Couldn't load a question right now." and "Skip" (adds the gap to the exclusions).
- Probe answer 409 `gap_not_open`: treat as "Already covered", skip to next without recording an answer.
- Network failure on any step shows an inline error with "Try again"; nothing is queued offline (the existing offline queues are for card grading only).
- Leaving the screen keeps the session in progress server-side; reopening resumes the runner.

## Shared files
Re-read before editing; targeted `Edit`.
- `HomeScreen.swift`: one line, `HomeStudyModesSection()` on the line directly after `HomeStudyToolsSection()`. Nothing else in the file.
- `HomeStudyModesSection.swift` is new and batch-1-owned; batch 2 never touches it.

## Edge cases
- Start on a completed session would reopen it server-side (no guard): the UI only offers Start for `planned`.
- Ending before time is up without `userRequestedEnd` returns the session unchanged; the model then keeps the runner.
- Timer uses `startedAt` from the server, so the banner is right after relaunch.
- Course deleted after planning: label falls back to "Course".

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: plan a 5 minute session on iOS, see it on web's study sessions page; start it, answer two questions, end it, see completed with 2 answered on web and the consistency rate change; a session ended with no answers shows Abandoned.

## Defaults
- Focus choices are Anything or a course; mode is `socratic` (web default, `study-session.controller.ts:128-148`).
- Consistency uses the server's 30-day window; no window picker.
- Answers are not queued offline; a failure is retried by the learner.
