# Search: report

## What the learner can now do
- Open Search from Home (Find and import): type a word, results appear after a short pause.
- Everything: subjects (opens that subject's courses), courses, topics. Topics and modules: ranked rows with tags; topic and module rows open; knowledge items are not tappable.

## Files (Sources/PostAnkiIOS/)
- New: API/GlobalSearchModels.swift, API/APIClient+GlobalSearch.swift, GlobalSearchModel.swift, GlobalSearchScreen.swift, GlobalSearchSubjectScreen.swift
- Edited: HomeDailySection.swift (Find and import section with a Search row)

## Build
xcodegen generate then xcodebuild (simulator, unsigned): BUILD SUCCEEDED.

## Defaults taken
- Debounce 300 ms, limit 20; Home row rather than toolbar.
- Search re-runs when the scope picker changes.

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
