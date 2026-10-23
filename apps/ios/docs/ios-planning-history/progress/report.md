# Progress report

## Behaviour for the learner
- Home: a "Today" block at the top shows the streak ("N-day streak (best M)", a nudge if not studied today, "Start a streak today" at zero), questions answered, topics mastered and up to 3 recent subjects. Pull to refresh reloads it; offline keeps old numbers.
- Progress tab: this week's retention, time to mastery, streak and coverage; coverage per area (gaps orange); concerns; all-time retention; milestones newest first (empty state included). Sections fail independently.
- Course screen: "Your progress" at the top with practised count, up to 3 weak spots, a "Next:" link when the next topic is in this course, and "See all stats" (weak spots, strong points, recommendations).

## Files
New in Sources/PostAnkiIOS: API/ProgressModels.swift, API/APIClient+Progress.swift, HomeSummarySection.swift, ProgressScreen.swift, ProgressRows.swift, CurriculumStatsSection.swift.
Edited (additive): HomeView.swift (Progress tab, order Home, Courses, Review, Progress, Ingest, Inbox), HomeScreen.swift, CoursesScreen.swift (CurriculumDetailScreen only).

## Build
xcodegen + xcodebuild exit code: 0, no warnings shown.

## Defaults
As in plan.md: Progress is a real tab (Ingest/Inbox go to More); retention breakdown dropped; both /home/summary and /streak called; stats screen refresh uses the loaded stats' curriculumId.

## Left undone
Nothing. Manual device checks not run.

END-OF-REPORT
