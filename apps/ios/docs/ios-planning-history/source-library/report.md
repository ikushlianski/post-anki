# Source library and content inbox: report

## What the learner can now do
- Home > Source library: every source grouped by subject and course with kind and fetch badge, searchable.
- Swipe a link to Re-fetch, swipe any source to Delete (asks first).
- Home > Content inbox: read-only list of distilled facts with suggested placement.

## Files (Sources/PostAnkiIOS/)
- New: API/SourceLibraryModels.swift, API/APIClient+SourceLibrary.swift, SourceLibraryModel.swift, SourceLibraryScreen.swift, ContentInboxScreen.swift
- Edited: HomeDailySection.swift (two rows)

## Build
xcodegen generate then xcodebuild (simulator, unsigned): BUILD SUCCEEDED.

## Defaults taken
- Delete always asks first; delete sits first in swipe actions.
- Fetched badge uses a relative date.

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
