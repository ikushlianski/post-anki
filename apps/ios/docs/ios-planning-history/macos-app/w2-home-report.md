# Wave 2a: Mac Home screen

## Done
- `git mv` to Sources/Shared: HomeSummarySection.swift (with HomeSummaryModel), LastStudied.swift.
- Split out of iOS files into Sources/Shared: DueTodayModel.swift (DueTodayFailure, DueTodayModel), HomeScreenModel.swift. iOS DueTodayCard.swift keeps DueTodayRow; HomeScreen.swift keeps the view. No behaviour change.
- New Sources/PostAnkiMac/MacHomeView.swift: `MacHomeView(onStudyNow:onOpenCourses:)` with Today (shared summary), Due today (total, breakdown, prominent Study now as default action, "Nothing due" and disabled at 0), Continue studying (last course, topic count, Open in Courses, course error keeps the name), "No course yet" empty view, toolbar Reload with Cmd-R, `.task` load.
- MacCoursesView records LastStudied when a course detail opens.
- xcodegen run once (files moved/added). Not touched: MacRootView, MacSidebarItem, PostAnkiMacApp, project.yml.

## Defaults
- Offline/401 on due load reuses the iOS message text, copied into MacHomeView (DueTodayRow's private copy stays for iOS).
- Summary offline text still says "Pull to refresh" (shared package string); wave 5 owns Mac copy.
- Study now shortcut is Return (default action); Reload disabled while any of the three loads runs.

## Verification
- PostAnkiMac macOS build: BUILD SUCCEEDED (/tmp/dd-home).
- PostAnkiIOS simulator build: BUILD SUCCEEDED (/tmp/dd-home-ios).
- Not run: GUI checks (unwired until wave 3).

END-OF-REPORT
