# Learning list and learning paths: report

## What the learner can now do
- Save an article or video link (videos need a short description) and pick its subject; the app waits on "Reading the link..." and maps server failures to plain messages.
- See the list grouped as Needs your decision, Parked, Working on it, Done.
- Open an item to read the suggestion and reasons, approve or decline it, choose a destination for parked items, sort a saved-but-unsorted link, and open the course that was created.
- Browse learning paths (active first), start one from a role template, see step progress with the "Next" step marked, and abandon a path.
- Entry points: new Home section "Learn more" with rows "Learning list" and "Learning paths".

## Files (Sources/PostAnkiIOS/)
- New: API/LearningListModels.swift, API/APIClient+LearningList.swift, API/LearningPathModels.swift, API/APIClient+LearningPaths.swift, LearningListModel.swift, LearningListItemModel.swift, LearningListScreen.swift, LearningListItemScreen.swift, CaptureLearningItemSheet.swift, LearningPathsModel.swift, LearningPathsScreen.swift, LearningPathDetailScreen.swift, HomePracticeSection.swift
- Edited: HomeScreen.swift (one line, `HomePracticeSection()` before `HomeStudyToolsSection()`)

## Build
xcodegen generate then xcodebuild: exit 0.

## Defaults taken
- Items have no subject field on the server, so "Sort it now" shows a subject picker (first subject preselected) instead of reusing the item's subject.
- Item model split into LearningListItemModel.swift to keep files short.
- Step percent is an integer (server schema), step status labels: Not started / In progress / Done.
- No polling; pull to refresh.

## Left undone
- Step practice and nudge replies (dropped in the plan).
- Not run on a simulator against the live API; build only.

END-OF-REPORT
