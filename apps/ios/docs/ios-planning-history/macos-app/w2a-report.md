# Wave 2a report: topic study and practice

Diff: `git diff --cached -M -- Sources/PostAnkiMac/Practice Sources/PostAnkiMac/Features/MacPracticeFeatures.swift Sources/PostAnkiMac/MacCoursesView.swift Sources/Shared/ChatViews.swift Sources/Shared/CurriculumDetailScreen.swift Sources/Shared/ExerciseScreen.swift Sources/Shared/IngestScreen.swift Sources/Shared/NoteComposerSheet.swift Sources/Shared/TopicStudyScreen.swift` (the shared index also holds sibling agents' staged files).

## Checks
- Private project via `xcodegen generate -s project.yml -p /private/tmp/xc-2a` (worked; paths resolve; nothing generated in the repo), own derived data /private/tmp/dd-2a.
- PostAnkiMac (platform=macOS): BUILD SUCCEEDED, no new warnings. PostAnkiIOS (iOS Simulator): BUILD SUCCEEDED.
- One earlier Mac build failed on a sibling's half-written file (MacLibrarySupport); retried after a pause, fine.
- No package.json/vitest/lint in this Swift repo; `swift test` not rerun (package untouched). No GUI click-through.

## What changed
- `MacPracticeFeatures`: entry "Quick practice" (id quick-practice, Study, order 30, no shortcut).
- New `Sources/PostAnkiMac/Practice/MacQuickPracticeView.swift`: answer queue of knowledge bits using `IngestScreenModel`; load/empty states, Reload Cmd-R, answer focused, Return submits, Shift-Return newline, Return on "Next" continues.
- `CurriculumDetailScreen` (Shared): iOS body kept verbatim under `#if os(iOS)`; macOS body adds stats, module "Practice this module" (disabled when empty), per-topic row buttons (Practice, Study tools, Add knowledge), a selection context menu with the same three actions, Return/double-click on a selected topic opens Study tools, Reload Cmd-R, load-failure and empty states.
- `MacCoursesView`: private `MacCurriculumDetailView` removed; course rows push the shared `CurriculumDetailScreen`.
- `ExerciseScreen`: macOS-only answer focus, Return submits, Shift-Return newline, Return activates Next.
- `ChatViews` composer: macOS Return sends, Shift-Return newline (applies to ask, socratic, topic and item chats).
- `NoteComposerSheet`: Cmd-Return saves, min size on Mac. `TopicStudyScreen`: Reload Cmd-R on Mac. `IngestScreenModel`: new `failure` property (iOS ignores it).

## Defaults taken
- "Digits grade" skipped: ExerciseScreen has no grade buttons on iOS.
- Quick practice is a Mac view over the iOS Ingest model; iOS `IngestScreen` unchanged (its own stack and title "Ingest").
- Offline answers: existing `PendingAnswerQueue` path in ExerciseScreen unchanged (flushed on activation by W1); Quick practice does not queue, same as iOS.
- Return opens Study tools via `contextMenu(forSelectionType:primaryAction:)` (also fires on double-click).
- `CourseEditSection` link stays in the Mac course detail (W3a will rework it); the Mac reload also reloads stats.
- Quick practice has no shortcut; no keyboard conflicts added.
- Ran plain private-spec xcodegen, not `xcodegen generate` in the repo.

## Manual checks
1. Sidebar Study shows "Quick practice"; opens with the answer field focused; Return submits, then Return on Next continues; empty queue shows empty state; offline shows the offline state with Try again.
2. Courses > a course: stats, edit link, modules; "Practice this module" disabled for an empty module.
3. Select a topic, press Return: Study tools opens; right-click shows Practice / Study tools / Add knowledge; row buttons do the same.
4. Exercise: field focused, Return submits, Shift-Return adds a line, Return after feedback goes to next.
5. Any chat (topic chat, Discuss, Ask): Return sends, Shift-Return newline.
6. Topic study: Cmd-R reloads notes; add note sheet saves with Cmd-Return.
7. Go offline during an exercise answer: "Saved..." message; reactivate the app online and confirm it grades.

END-OF-REPORT
