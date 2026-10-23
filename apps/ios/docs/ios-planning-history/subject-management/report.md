# Subject management: report

## What the learner can now do
- Courses tab: new "Organise" section with "Manage subjects".
- Add a subject (optionally inside another), rename, reorder siblings (Edit button, drag), merge into another subject of the same kind, delete. Merge and delete ask first and name the consequences.
- Per subject: create, rename and nest categories, and put a course in a category or back to "No category".

## Files (Sources/PostAnkiIOS/)
- New: API/SubjectManageModels.swift, API/APIClient+SubjectManage.swift, SubjectManageModel.swift, SubjectManageScreen.swift, SubjectManageSheets.swift, SubjectCategoryModel.swift, SubjectCategoryScreen.swift, CourseOrganizeSection.swift
- Edited: CoursesScreen.swift (one line: `CourseOrganizeSection(...)` after the subjects ForEach)

## Build
xcodegen generate then xcodebuild (simulator): exit 0.

## Defaults taken
- Sibling groups render as separate sections ("Subjects", "Inside <parent>") so each drag stays inside one parent.
- Category screen lists categories flat, depth shown by header indent; "Move into..." is a confirmation dialog of categories.
- Course counts for the delete and merge copy come from the course list loaded with the subjects.
- Courses list reloads when the manage screen closes after any change.
