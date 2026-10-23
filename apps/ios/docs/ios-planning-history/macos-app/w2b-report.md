# Wave 2b report: Mac study modes

Diff: `git diff --cached -M -- Sources/PostAnkiMac/StudyModes Sources/PostAnkiMac/Features/MacStudyModeFeatures.swift Sources/Shared/StudySessionRunScreen.swift Sources/Shared/TopicQuizScreen.swift Sources/Shared/LectureScreen.swift Sources/Shared/PlanStudySessionSheet.swift`

## Checks
- Private project via `xcodegen generate -p /private/tmp/xc-2b` (decision 13 works; regenerate after siblings add files).
- PostAnkiMac (platform=macOS, derived data /private/tmp/dd-2b): BUILD SUCCEEDED, no new warnings. An earlier failure came from 2a's half-written ChatViews and unwired sibling views; it cleared on retry.
- PostAnkiIOS (iOS Simulator): BUILD SUCCEEDED.
- `swift test` not run (package untouched). No GUI click-through.

## What changed
- New entries in `MacStudyModeFeatures`: "Study sessions" (id study-sessions, Study, order 40) and "Gaps coming back" (id resurfacing-gaps, Study, order 50); no shortcuts, both use the root stack.
- `Sources/PostAnkiMac/StudyModes/`: `MacStudySessionsView` (Table: title, planned time, status; Plan session and Reload Cmd-R toolbar; double-click or Return opens run screen; shared plan sheet with start-now; empty and error states), `MacResurfacingGapsView` (list with Important / Later again / Dismiss buttons and context menu, empty/error states, Reload), `MacStudySessionRunStore` (keeps run models per session id).
- Shared (Mac-only guards): `TopicQuizScreen` digits 1-4 pick an option, Return triggers Submit/Next; `LectureScreen` content max width 760; `PlanStudySessionSheet` min sheet size; `StudySessionRunScreen` gets optional `model` init parameter (iOS call sites unchanged).

## Defaults taken
- Orders 40 and 50 in Study (plan gave none beyond Progress at 80; 2a/2d may use 30/60+).
- Session timer edge: the run model lives in a Mac store, so draft, current question and result survive switching entries; the timer itself derives from the server start time.
- Gaps: no delete API exists, so no Delete key; Dismiss is the context-menu action instead.
- Table error state uses `.other` with the model's message (model holds only a string).
- Quiz digits also toggle options in multi-select questions.
- `TopicStudyModesSection`, `GapRow`, `TopicGaps*`, `Socratic*`, `AddGapSheet` unchanged (nothing Mac-specific needed; Socratic composer gets Return-to-send from 2a's ChatViews).

## Manual checks
- Study > Study sessions: table lists sessions; Plan session sheet creates one (with Start now opens it); Cmd-R reloads; start a session, switch to another entry and back, run screen keeps the question.
- Study > Gaps coming back: context menu triage removes the row; empty state shows when none.
- Topic Quick test: press 1-4 to answer, Return for Next. Lecture: text column stays readable on a wide window.

END-OF-REPORT
