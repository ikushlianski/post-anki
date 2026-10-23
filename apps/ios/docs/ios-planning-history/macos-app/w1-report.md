# Wave 1 report: port iOS feature code into Shared

Diff: `git diff --cached -M --stat`

## Checks
- `xcodegen generate` once: ok.
- PostAnkiMac (platform=macOS, CODE_SIGNING_ALLOWED=NO): BUILD SUCCEEDED, no new warnings.
- PostAnkiIOS (generic iOS Simulator): BUILD SUCCEEDED.
- `swift test --package-path Packages/PostAnkiAPI`: 34 tests passed.
- No simulator tab-by-tab run was done (no GUI); iOS changes are renames plus shim calls that expand to the original modifiers on iOS.

## What changed
- 104 files moved with `git mv` from `Sources/PostAnkiIOS` to `Sources/Shared` (staged as renames).
- Stayed iOS-only (decision 2): PostAnkiIOSApp, HomeView, HomeScreen, 4 Home*Section, SettingsToolsSection, DueReviewScreen, DueTodayCard, KnowledgeListScreen, ProgressScreen, CoursesScreen (list only).
- New `Sources/Shared/CurriculumDetailScreen.swift`: `CurriculumDetailScreen` and `TopicRow` moved verbatim out of `CoursesScreen.swift`.
- New `Sources/Shared/PlatformCompat.swift`: `.inlineNavigationTitle()`, `.urlTextInput()`, `.plainTextInput()`, `.macSheetMinSize(width:height:)`, toolbar placements `.leadingBar` (`.navigation` on Mac) and `.trailingBar` (`.primaryAction` on Mac). iOS expands to the original modifiers.
- Moved files: `navigationBarTitleDisplayMode(.inline)`, `textInputAutocapitalization`/`keyboardType(.URL)` and `topBar*` placements replaced by shim calls; `EditMode` environment and `EditButton` wrapped in `#if os(iOS)` in `CourseEditScreen` and `SubjectManageScreen`.
- `PostAnkiMacApp.swift` flushes `PendingAnswerQueue` next to `PendingGradeQueue` on activation.

## Defaults taken
- Shim names chosen by me (plan gave none); `macSheetMinSize` is defined but not used yet (Mac UI work belongs to later waves).
- `EditButton` in `SubjectManageScreen` also guarded to iOS (not on macOS); the plan named only the two course-edit files for `EditMode`.
- Pre-existing Shared files (e.g. `PendingReviewScreen`) are not modified; their iOS-guarded modifiers stay as is.
- `PostAnkiIOS.xcodeproj` is generated and not staged. No todos ticked, nothing committed.

END-OF-REPORT
