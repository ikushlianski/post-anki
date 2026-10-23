# ex9 report: history-backed navigation for the remaining Mac sidebar entries

## Behavior
Cmd-[ and Cmd-] now step back and forward on every sidebar entry that opens a detail screen. Opening an item from a list, a toolbar push or a "Start" action behaves as before; the toolbar back button keeps forward history.

## Converted entries (each owns its NavigationStack with a MacHistoryCenter path, ownsStack: true)
- learning-list (LearningListItem), learning-paths (path id), tags (Tag), subjects (SubjectManageSubject), study-sessions (session id), course-refocus (Curriculum)
- knowledge: route item / suspended list; knowledge-maps: route node / tool (priority, doc scan, recommendations)
- decide: route history / session, so history then session detail is a two-level path (MacStackHistory.push)
- language-practice: route practice / phrase bank / writing check; toolbar links became buttons pushing routes
- course-builds: new MacCourseBuildsEntryView owns the stack; MacCourseBuildsView takes an optional history and falls back to local state when pushed inside Courses authoring (no double stack)
- MacStackHistory gained open (replace, same as the old item state) and push (append)

## Skipped / left as is
- Courses already done. Not converted: pushes nested inside Courses (MacCourseDetailView authoring item, Courses root authoring item, Refocus detail authoring item): they push on top of a path screen and are not in the path, so Cmd-[ pops the path entry, not that inner screen. Real pushes, but nested second level; left to keep behavior identical.
- Entries without any push (home, review, due, progress, ask, open questions, daily push, inbox, sources, notion import, admin, duplicates, quick practice, resurfacing gaps): nothing to convert.
- Screens in Sources/Shared untouched.

## Defaults
- Pushes from a list use open (single-level, same as item state); second-level pushes use push.
- Single language-practice subject: root is the practice screen, its toolbar still pushes phrase bank and writing check through history.

## Checks
- xcodegen only on private copy /private/tmp/ex9spec; derived data /private/tmp/dd-g1.
- PostAnkiMac scheme tests: TEST SUCCEEDED (first run failed on a missing return in MacDecideView, fixed). PostAnkiIOS simulator build: BUILD SUCCEEDED.
- Tests added to Tests/PostAnkiMacRegistryTests/MacNavigationHistoryTests.swift (open replaces, push stacks, one history per entry).
- Diff: git diff --cached -- Sources/PostAnkiMac Tests/PostAnkiMacRegistryTests
- tsc/vitest/lint not applicable (Swift repo).

END-OF-REPORT
