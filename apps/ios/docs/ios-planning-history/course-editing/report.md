# Course editing: report

## What the learner can now do
- In a course screen, "Edit course structure" opens an editor: add, rename, reorder and delete modules and topics, and send a comment on a module or topic.
- Deleting a module or topic asks first. Closing the editor reloads the course screen.

## Files (Sources/PostAnkiIOS/)
- New: API/CourseEditModels.swift, API/APIClient+CourseEdit.swift, CourseEditModel.swift, CourseEditScreen.swift, CourseEditSheets.swift, CourseEditSection.swift
- Edited: CoursesScreen.swift (one line after CurriculumStatsSection)

## Build
xcodegen generate then xcodebuild (simulator): exit 0.

## Defaults taken
- Module order uses a separate "Order modules" mode; topics reorder with the Edit button inside each module.
- A failed reorder reloads from the server and keeps the error message.
- Comments are write-only; "Comment saved." is shown in the sheet.
