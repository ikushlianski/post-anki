# Wave 2d report: learning tools

Diff: `git diff --cached -M -- Sources/PostAnkiMac/Learn Sources/PostAnkiMac/Features/MacLearnFeatures.swift` plus the 7 staged Shared files (`git diff --cached -- Sources/Shared/{CaptureLearningItemSheet,DailyPushModel,DailyPushScreen,DecideModel,LearningListModel,LearningPathsModel,OpenQuestionsScreen}.swift`). Only 2d files are staged; sibling files are not.

## Checks
- Private project: `xcodegen generate -s project.yml -p /private/tmp/xc-2d` worked (decision 13 route); nothing generated in the repo.
- PostAnkiMac (generic macOS, derived data /private/tmp/dd-2d): BUILD SUCCEEDED, no new warnings.
- PostAnkiIOS (generic iOS Simulator): BUILD SUCCEEDED.
- No GUI run; Swift package untouched so `swift test` not rerun.

## What changed
- `MacLearnFeatures`: Learning list (Cmd-Shift-L), Learning paths, Challenge my thinking, Ask your cards, Open questions in Learn (orders 10-50); Daily push in Study (order 60).
- New `Sources/PostAnkiMac/Learn/`: `MacLearningListView` (selection list, approve/decline in toolbar and context menu, open link, Return/double-click pushes the item, text drop opens capture prefilled, empty state offers capture, Reload Cmd-R), `MacLearningPathsView` (role templates sheet, empty state), `MacDecideView` + `MacDecideHistoryView` (history as `Table`, Cmd-Return submits), `MacAskView` (wraps `AskScreen`), `MacOpenQuestionsView` (filter, Answer/Dismiss in toolbar and context menu, Delete key dismisses), `MacDailyPushView`.
- Shared (additive, iOS behaviour unchanged): `failureKind` (via `ProgressLoadError.from`) on learning list, paths, decide history, open questions and daily push models; `LearningListModel.decide(_:approve:)` and `actionMessage`; `CaptureLearningItemSheet.initialURL`; `DailyPushScreen.init(model:)` and a macOS-only Cmd-Return submit (`submitShortcut()`, also used on the resolve sheet); `OpenQuestionRow` and `ResolveQuestionSheet` made non-private.

## Defaults taken
- Decide session in progress survives switching entries via a main-actor store (`MacDecideStore`) holding the model; the ask chat and the daily push are not kept across entry switches.
- Ask has no Reload or state views (no load call); composer Return behaviour comes from 2a's `ChatViews`.
- Approve/Decline apply to all selected awaiting items, one call each.
- Learning list rows use a `List` (grouped sections) rather than a `Table`; decision 8 only requires Table for the decide history.
- Daily push error state replaces the screen only before first load; later errors show inline as on iOS.
- Learning paths rows push the shared detail via NavigationLink (no selection).

## Manual checks (for W4d)
- Learning list: empty account shows "Save a link"; drop a URL text on the pane opens capture with it; select a "Needs your decision" row, Approve/Decline from toolbar and right-click; Cmd-Shift-L jumps here.
- Learning paths: Start a path sheet lists templates and starts one; open a path, Abandon.
- Challenge my thinking: submit with Cmd-Return, switch entries and come back, session still shown; History table opens a past session.
- Ask your cards: ask, toggle general knowledge, Clear.
- Open questions: switch Open/Answered/Dismissed; right-click Answer / Dismiss; Delete key dismisses.
- Daily push: answer, Cmd-Return submits; Reload.
- Signed-out / offline: each entry shows the load-state view with Try again before first load.

END-OF-REPORT
