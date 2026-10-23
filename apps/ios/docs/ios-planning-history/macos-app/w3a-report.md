# Wave 3a report: course authoring

Diff: `git diff --cached -- Sources/PostAnkiMac/Authoring Sources/PostAnkiMac/Features/MacAuthoringFeatures.swift Sources/PostAnkiMac/MacCoursesView.swift Sources/Shared/CourseBuildCreateScreen.swift Sources/Shared/CourseBuildListScreen.swift Sources/Shared/CourseBuildScreen.swift Sources/Shared/CourseEditScreen.swift Sources/Shared/CourseEditSheets.swift Sources/Shared/CourseRefocusScreen.swift` (only 3a files staged; sibling files are not).

## Checks
- Private project via `xcodegen generate -s project.yml -p /private/tmp/xc-3a` (decision 13) worked; nothing generated in the repo.
- PostAnkiMac (generic macOS, /private/tmp/dd-3a): BUILD SUCCEEDED, no new warnings.
- PostAnkiIOS (generic iOS Simulator): BUILD SUCCEEDED.
- No GUI run; package untouched.

## What changed
- `MacAuthoringFeatures`: Course builds (Manage, order 30) and Refocus suggestions (Manage, order 40). Orders chosen to leave 10/20 for Subjects and Knowledge maps and 50 for Duplicates.
- New `Sources/PostAnkiMac/Authoring/`: `MacCourseBuildsView` (Table name/status, double-click or context menu opens the build, New course and Reload toolbar, reloads on app activation so an in-progress build shows its status), `MacRefocusView` (open course / dismiss as buttons and context menu), `MacCourseDetailView` (wraps the shared curriculum detail: toolbar Edit course and an Organize menu with Manage subjects, New course, Course builds; detail reloads after an edit via a view id bump), `MacCourseAuthoringDestination` (pushed destinations).
- `MacCoursesView`: toolbar New course and Course builds, detail now `MacCourseDetailView`, list reloads on app activation (course edited elsewhere).
- Shared (additive, iOS behaviour unchanged): `failureKind` on `CourseBuildListModel` and `CourseRefocusModel`; `CourseEditScreen` split into `list`/`rows`, macOS gets List selection, context menu on selected topic, Return/double-click renames, Delete key deletes (confirm dialog), sheet min size; drag reorder via existing `onMove`; `EditMode` stays iOS-only. `CourseEditTitleSheet` Return submits (macOS only), comment sheet Cmd-Return sends (macOS only). `CourseBuildCreateScreen`: grouped form and Cmd-Return create (macOS only). `CourseBuildScreen`: Reload (Cmd-R) toolbar and "Press Cmd-R" text (macOS only).

## Defaults taken
- Edit course opens as a pushed screen (not a sheet), so the root stack's back button returns and triggers the reload.
- `CurriculumDetailScreen` (2a-owned, not edited) still shows its own "Edit course structure" row; the new toolbar button duplicates it.
- Organize menu includes Manage subjects (reuses the shared `SubjectManageScreen`, read-only use of 3b's file) as the iOS Organise section does.
- A course opened from a finished build ("Open course" inside `CourseBuildScreen`) uses the plain shared detail without the Edit/Organize toolbar, since the wrapper lives in the Mac target.
- Course builds uses a single-select Table; no delete exists in the API so no Delete key there.

## Manual checks (for W4d)
- Courses: toolbar New course (create a course, lands on build screen) and Course builds; open a course, toolbar Edit course; rename a topic (select, Return), Delete key deletes with confirmation, drag topics, Order modules; go back and the course reloads.
- Organize menu: Manage subjects, New course, Course builds.
- Course builds entry: in-progress build shows status, double-click opens, Cmd-R refreshes; empty state offers New course.
- Refocus suggestions: Open course, Dismiss, context menu; empty state.
- Offline/signed-out: both entries show the load-state view with Try again.

END-OF-REPORT
