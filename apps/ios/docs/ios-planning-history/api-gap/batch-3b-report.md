# Batch 3B report: courses (subject management, course building, course editing)

## Result
All three plans are built in order. Courses tab gets an "Organise" section (Manage subjects, New course, Courses being built), and each course screen gets "Edit course structure". Simulator build (`xcodegen generate`, then `xcodebuild` generic iOS Simulator, unsigned): BUILD SUCCEEDED, no warnings in the new files. There is no test target; nothing was run against a server.

## Per-plan files
Each folder has `report.md` and `manual-test-sequence.md`:
- `.planning/subject-management/`
- `.planning/course-building/`
- `.planning/course-editing/`

## Edits to existing files (CoursesScreen.swift only, one line each)
- `CourseOrganizeSection(onChange: { Task { await model.load() } })` after the subjects ForEach.
- `CourseEditSection(curriculum: curriculum) { Task { await model.load(curriculumId: curriculum.id) } }` after `CurriculumStatsSection(...)`.
Both anchors were re-read before editing.

## Defaults taken
- Subject reorder: one section per sibling group ("Subjects", "Inside <parent>") so drags never cross parents.
- Categories shown as headers with indent by depth; "Move into..." is a dialog of categories.
- Reorder failure reloads from the server and keeps the error text.
- Course building polling: one task, 4 s gathering, 3 s while an assistant turn is pending, 10 minute cap with "Still working. Pull to refresh."
- After "Confirm course" an "Open course" link appears rather than an automatic push.
- Retry choice: sources origin reparse, else retry-structure-draft if attempted, else retry-research.
- "Skip these" for research candidates sends an empty approved list.
- Module order uses a separate "Order modules" mode; topic order uses the Edit button.
- Course editing comments are write-only ("Comment saved.").
- Todo files were not touched (managed by the todo CLI).

## Notes
- The Xcode project is generated and gitignored, so no project file changed.
- `git add Sources` also staged other batches' new files that existed at that moment; they were not edited by this batch.
- Delete/merge subject, remove source, delete module/topic all use confirmation dialogs.

END-OF-REPORT
