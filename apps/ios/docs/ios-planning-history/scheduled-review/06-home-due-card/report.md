# 06 Home due-today card: report

## Built
- Sources/PostAnkiIOS/DueTodayCard.swift: `DueTodayModel` (@MainActor @Observable, stores `ReviewCounts?`, state idle/loading/failed(offline|unauthorized|other)), `DueTodayRow` (NavigationLink to `DueReviewScreen()`, title "Due today", bold total, breakdown subtitle, checkmark + "Nothing due today" on zero, ProgressView on first load, failure text only when no prior counts). `.task` on the row reloads on every appear.
- Data comes from `APIClient.reviewCards(limit: 1, tz: TimeZone.current.identifier)` (orchestrator override; no own decode struct).

## HomeScreen.swift lines added
- `    @State private var dueModel = DueTodayModel()` (after `@State private var model`)
- `                Section { DueTodayRow(model: dueModel) }` (first child of List, followed by a blank line)
- `.refreshable { await model.load() }` replaced by:
```
.refreshable {
    async let course: Void = model.load()
    async let due: Void = dueModel.load()
    await course
    await due
}
```
"Add knowledge" Section untouched. HomeScreen.swift not staged; DueTodayCard.swift staged.

## Defaults
- Section first in the List; keep last counts on failure; no persistence.

## Build
xcodegen + xcodebuild exit code: 0.

## Deviations
- Used existing `APIClient.reviewCards` and `ReviewCounts` instead of own decode struct (per orchestrator).

END-OF-REPORT
