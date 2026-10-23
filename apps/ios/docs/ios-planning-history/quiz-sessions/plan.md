# Quiz sessions: quick test and Socratic dialogue on a topic

## Goal
Covers the single coding task in `.planning/quiz-sessions/todo.md`: let the learner be quizzed on one topic, either as a multiple-choice "Quick test" or as a Socratic back-and-forth with a mentor. Mirrors the web topic room (`apps/web/src/routes/probe.$topicId.tsx:165-174`), which offers exactly these two modes.

Batch 1, built first. This plan creates the batch-1 topic hub file the later batch-1 plans (lectures, gaps) add rows to.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-408`, 401). Errors are `{ "error": "<code>" }`; validation is 400 `invalid_input`. Unhandled throws are 500 `internal_error`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /probe-sessions/active?scope=topic&scopeId=<topicId>&mode=practice` | `apps/api/src/router-table.ts:274`, `api-server.ts:605-627`, `apps/api/src/probe-session/probe-session.controller.ts:46-72` | query only | `ProbeSession` or JSON `null` when none is active (`apps/api/src/probe-session/probe-session.service.ts:194`) | 400 `invalid_input` |
| `POST /probe-sessions` | `router-table.ts:275`, `api-server.ts:605-627`, `probe-session.controller.ts:25-44` | `{ scope: "topic", scopeId, allowMultiSelect: true }` (`packages/shared/src/probe-session.ts:81-90`) | `ProbeSession`; returns the existing active session unless `regenerate: true` (`probe-session.service.ts:76-191`) | 404 `not_found`, 409 `not_confirmed` (course not confirmed), 502 `generation_failed` (`probe-session.controller.ts:16-23`) |
| `POST /probe-sessions/:id/answer` | `router-table.ts:276`, `api-server.ts:605-627`, `probe-session.controller.ts:74-100` | `{ questionId, selectedIndex?: int, selectedIndices?: [int] }` (`probe-session.ts:94`) | `AnswerProbeSessionResult` (`probe-session.ts:133-146`) | 404 `not_found` / `question_not_found` |
| `POST /socratic-sessions` | `router-table.ts:277`, `api-server.ts:605-627`, `apps/api/src/socratic/socratic.controller.ts:19-38` | `{ topicId, regenerate?: bool }` (`packages/shared/src/socratic.ts:50`) | `SocraticSession` (`socratic.ts:37`); resumes the active session and its pending turn (`apps/api/src/socratic/socratic.service.ts:72-141`) | 404 `not_found`, 409 `not_confirmed`, 409 `calibration_required` (`socratic.service.ts:72-89`) |
| `POST /socratic-sessions/:id/answer` | `router-table.ts:278`, `api-server.ts:605-627`, `socratic.controller.ts:40-66` | `{ turnId, answer }` (`socratic.ts:57`) | `AnswerSocraticResult` (`socratic.ts:88`); a blank answer returns `action: "retry"` (`socratic.service.ts:143`) | 404 `not_found` / `turn_not_found` |
| `POST /socratic-sessions/:id/complete` | `router-table.ts:287`, `api-server.ts:605-627`, `socratic.controller.ts:86` | no body | `{ completed: bool, summary: SocraticSessionSummary or null }` (`socratic.ts:117`); summary is null when no turn was answered (`socratic.service.ts:353`) | 404 `not_found` |

Shapes:
- `ProbeSession` (`probe-session.ts:62-77`): `{ id, scope, scopeId, curriculumId: String?, mode, status: "active"|"completed", total, correct, answered: Int, createdAt, questions: [ProbeSessionQuestion] }`.
- `ProbeSessionQuestion` (`probe-session.ts:42-58`): `{ id, order, topicId?, gapId?, prompt, options: [String], difficulty, format: "true_false"|"mcq", type: "single"|"multi", answeredIndex: Int?, answeredIndexes: [Int]?, outcome: "pass"|"fail"|null, correctAnswerIndex: Int?, correctAnswerIndexes: [Int]?, optionExplanations: [{ text, citationUrl? }]? }`. A question is answered when `answeredIndex != nil`.
- `AnswerProbeSessionResult`: `{ questionId, outcome, correctAnswerIndex, correctAnswerIndexes?, correct, answered, total, status, coveredGapLabels: [String], optionExplanations?, gapMastery: { gapId, label, status, masteryStage, justMastered }?, courseLengthRecommendation: { recommendation, alreadyKnownRatio }? }` (`probe-session.ts:110-146`).
- Practice sessions top themselves up in the background when few unanswered questions remain (`probe-session.service.ts:61,436`); the web client re-reads the active session to pick them up (`apps/web/src/curriculum/probe-session-quiz.tsx`).
- `SocraticTurn` (`socratic.ts:27`): `{ id, gapId?, conceptLabel, prompt, order }`. `SocraticSession`: `{ id, topicId, curriculumId, status, current: SocraticTurn?, conceptsTotal, conceptsCovered, topicMaturity }`.
- `AnswerSocraticResult`: `{ action: "advance"|"point_out"|"explain_hint"|"give_answer"|"move_on"|"retry", degree?, feedback, conceptLabel, covered, next: SocraticTurn?, status, conceptsCovered, conceptsTotal, topicMaturity, checkpointReached, checkpointSummary? }`.
- `SocraticSessionSummary` (`socratic.ts:75`): `{ topicTitle, depth, solidConcepts: [String], mostRecentGap: { gapId, label }?, gapsLoggedCount, crossCuttingConcerns: [String], exchangeCount, topicMaturity }`.

## Dropped
- `POST /socratic-sessions/:id/check-idle`: bot-only idle sweep (`apps/api/src/socratic/socratic.controller.ts:70`).
- Exam mode, and the module, tag and curriculum scopes of probe sessions: not part of a topic quiz.
- `POST /topics/:id/probe` (single-question probe): web's topic room uses probe sessions instead. Its answer call is owned by the study-sessions plan.
- Per-question feedback and "save as open question": not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/QuizSessionModels.swift` (~110 lines): models above.
- `API/APIClient+QuizSessions.swift` (~70 lines): `activeTopicQuiz(topicId:)`, `prepareTopicQuiz(topicId:regenerate:)`, `answerQuizQuestion(sessionId:questionId:selected:)`, `startSocratic(topicId:regenerate:)`, `answerSocratic(sessionId:turnId:answer:)`, `completeSocratic(sessionId:)`. Own file-private `encodedSegment`/`path` helpers, copied from `API/APIClient+StudyTools.swift`.
- `TopicQuizModel.swift` (~120 lines), `TopicQuizScreen.swift` (~170 lines): quick test.
- `SocraticModel.swift` (~110 lines), `SocraticScreen.swift` (~150 lines): Socratic dialogue.
- `TopicStudyModesSection.swift` (~30 lines): batch-1 topic hub section, first row(s) from this plan.

## Swift models (`API/QuizSessionModels.swift`)
`Decodable, Sendable, Hashable`; inputs `Encodable, Sendable`. Prefixes `Quiz*` and `Socratic*` are reserved for batch 1.
- `QuizSession`, `QuizQuestion`, `QuizOptionExplanation { text; citationUrl: String? }`, `QuizAnswerResult`, `QuizGapMastery`. Decode the optional/nullable fields as Swift optionals.
- `PrepareQuizInput { scope: String = "topic"; scopeId; allowMultiSelect: Bool = true; regenerate: Bool? }`, `AnswerQuizInput { questionId; selectedIndex: Int?; selectedIndices: [Int]? }` (omit nils).
- `SocraticTurn`, `SocraticSession`, `SocraticAnswerResult`, `SocraticSummary`, `SocraticCompleteResult`, `StartSocraticInput { topicId; regenerate: Bool? }`, `AnswerSocraticInput { turnId; answer }`.
- The active-session GET may return the literal `null`: decode as `QuizSession?` via `request<QuizSession?>` (Foundation decodes a top-level `null` into an Optional).
- Errors use the existing `StudyToolsError.message(for:notFound:)` (read-only reuse) plus a small switch for 409 codes: `not_confirmed` "This course isn't confirmed yet. Confirm it on the web first.", `calibration_required` "Take this course's calibration quiz on the web first.", 502 `generation_failed` "Couldn't generate questions right now. Try again."

## Screens and behaviour

### Entry
- `TopicStudyModesSection(topic:)`: `Section("Quiz")` with "Quick test" (`checklist`) pushing `TopicQuizScreen(topic:)` and "Socratic dialogue" (`bubble.left.and.text.bubble.right`) pushing `SocraticScreen(topic:)`.

### Quick test (`TopicQuizModel`, `TopicQuizScreen`)
- `@MainActor @Observable final class TopicQuizModel`: `session: QuizSession?`, `currentId: String?`, `selectedMulti: Set<Int>`, `lastResult: QuizAnswerResult?`, `isLoading`, `isGenerating`, `isSubmitting`, `errorMessage`.
- `load()`: GET active. Current question = lowest `order` with `answeredIndex == nil`.
- No session: "No quiz yet for this topic." and a prominent "Generate questions" button (POST, `isGenerating` shows "Generating questions..." spinner; can take tens of seconds).
- Question view: header "Question N/total" and "Score correct/answered"; prompt; options as full-width buttons for `single` (tap submits), checkboxes plus "Submit" for `multi` ("Select all that apply"). All controls disabled while submitting.
- After an answer: the model patches the question locally (answeredIndex, outcome, correct indexes, explanations) and counters from the result, as web does (`probe-session-quiz.tsx`). Show "Correct." or "Not quite.", tint the correct option(s) green and a wrong pick red, each option's explanation under it, and `gapMastery.justMastered` as "Resolved: <label>". "Next" advances.
- When no unanswered question is left and `status == "active"`, re-GET active once to pick up topped-up questions; if still none, show "Quiz complete: correct/total." with "New quiz" (POST with `regenerate: true`, after a confirm dialog because it discards the old practice session).
- `status == "completed"` shows the same complete view.
- States: first-load spinner; failure `ContentUnavailableView` with "Try again"; pull to refresh re-runs `load()` (keeps the current question if it is still unanswered).

### Socratic dialogue (`SocraticModel`, `SocraticScreen`)
- `@MainActor @Observable final class SocraticModel`: `session`, `messages: [SocraticMessage]` (local `{ id, role: mentor|learner, text }`), `currentTurn`, `draft`, `isSending`, `summary: SocraticSummary?`, `blockedReason: String?`, `errorMessage`.
- `start()` on appear: POST `/socratic-sessions`. Seeds the mentor message with `current.prompt`. `status == "completed"` with no current turn shows "You've covered every concept in this topic." 409 `calibration_required`/`not_confirmed` set `blockedReason` and show it as a `ContentUnavailableView` (no composer).
- Composer reuses `ChatComposerBar` and messages reuse `ChatMessageRow` from `ChatViews.swift` (read-only reuse), assistant label "Mentor". Send appends the learner message, posts the answer, appends `feedback`, then the `next.prompt` when `next.id` differs from the current turn. `action == "retry"` keeps the same turn.
- Progress line under the title: "conceptsCovered/conceptsTotal concepts, maturity N%".
- `checkpointReached` shows an inline card "Good checkpoint" with `checkpointSummary` (solid concepts list, exchange count) and buttons "Keep going" / "Finish".
- Toolbar "Finish": POST complete; shows a summary sheet (topic, depth, solid concepts, most recent gap); `summary == nil` shows "Session ended." Then the screen shows a "Start again" button (POST with `regenerate: true`).
- Send failure restores the draft and shows the message (same as `StudyChatModel`). Leaving the screen keeps the server session; reopening resumes the pending turn.

## Shared files
Re-read each file right before editing; targeted `Edit`, never a rewrite.
- `TopicStudyScreen.swift` (study-tools, done): one line inside the `List`, directly after the closing brace of `Section("Study") { ... }`: `TopicStudyModesSection(topic: topic)`.
- `HomeScreen.swift`: not edited by this plan (study-sessions adds the batch-1 Home line).
- New batch-1-owned file later batch-1 plans append rows to: `TopicStudyModesSection.swift`. Batch 2 never touches it.

## Edge cases
- Double tap on an option: ignored while `isSubmitting`.
- Server returns an already-answered question again (replay): the answer response is idempotent server-side (`probe-session.service.ts:208`); the UI just shows the result.
- Topic deleted mid-quiz: 404 shows "This topic was removed." and disables controls.
- Answer over the network fails: the selection stays, an inline error offers "Try again"; nothing is queued offline.

## Verification
No test target. `xcodegen generate`, then the usual simulator `xcodebuild` exits 0. Manual: generate a quick test on iOS, answer two questions, open the same topic's Quick test on web and see the same session with the same score; start Socratic on iOS, answer once, reopen and see the pending turn resumed; Finish shows a summary; a course without calibration shows the calibration message.

## Defaults
- Practice mode only, topic scope only, `allowMultiSelect: true` (matches web, `probe-session-quiz.tsx`).
- "New quiz" and "Start again" confirm first because they discard or close the old session.
- Calibration is not offered on iOS; the blocked state points to web.
- Topic hub is the only entry; no Home row for quizzes, since they need a topic.
