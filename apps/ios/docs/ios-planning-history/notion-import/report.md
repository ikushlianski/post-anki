# Notion import: report

## What the learner can now do
- Home > Import from Notion: paste a database link or id, Import, see Imported N; Continue import for large databases; item detection runs at the end.

## Files (Sources/PostAnkiIOS/)
- New: API/NotionImportModels.swift, API/APIClient+NotionImport.swift, NotionImportModel.swift, NotionImportScreen.swift
- Edited: HomeDailySection.swift (one row)

## Build
xcodegen generate then xcodebuild (simulator, unsigned): BUILD SUCCEEDED.

## Defaults taken
- Detection once at the end, only when something was created; last id not stored.
- The 'Imported N new items' line is hidden when N is 0.

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
