# Plan-3 report: full iOS parity on the Mac, runnable locally

Plan: `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/macos-app/plan-3.md` (163 lines). Todos: `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/macos-app/plan-3-todos.md` (13 lines). No questions asked; 14 defaults logged in the plan's "Decisions taken".

## Waves
- W0 (solo): the sidebar becomes collapsible sections (Study, Library, Learn, Manage, Admin) built from nine small group registry files plus a frozen aggregator and a navigator. Later agents fill only their own group file and add view files; the root view and menu commands never change again (except the launch banner in W4).
- W1 (solo): one mechanical move of about 104 iOS files into Sources/Shared, with a single shim file for iOS-only modifiers. The iOS app keeps only its shell (tab bar, Home and its sections, and the iOS versions of due review, knowledge list, progress and courses list). One move instead of per-group moves, because hub screens (topic study, course detail, exercise, chat) are used across groups and per-group moves would break parallel builds.
- W2 (4 parallel): topic study and practice, study modes, library and capture, learning tools.
- W3 (3 parallel): course authoring, subjects and knowledge maps, language practice plus duplicates and admin.
- W4 (4 parallel): smoke-test target (owns project.yml), dev server address and launch check (owns the package, Config and Settings), README and run script, manual test sequence.

## Facts that shaped the plan
- No iOS file uses UIKit, VisionKit or Speech. The only iOS-only APIs in use are title display mode, top-bar toolbar placements, keyboard and autocapitalization modifiers, and EditMode (course edit and the iOS knowledge list only). So porting is mostly mechanical.
- The API address is already editable in the shared Settings screen and requests use the shared URL session, so a fake URL protocol can drive smoke tests without changing the package.
- The iOS exercise screen queues offline answers in a separate queue that the Mac app does not flush yet. W1 adds that flush.
- The manual test sequence names the wrong Local.xcconfig path. W4d fixes it.

## Contention handled
- Each hub file has exactly one owner per wave. MacCoursesView passes from W2a to W3a. project.yml belongs to W4a only, and the package to W4b only.
- Parallel agents generate a private project with `xcodegen generate -p /private/tmp/xc-<todo>` and use their own build folders. Only the wave owner regenerates the repo project, once, at the gate.

## To verify during implementation
- `xcodegen -p` output paths work for the private per-agent projects. If not, agents rely on the gate.
- A custom Info.plist key combined with generated Info.plist reaches the Mac bundle.
- Plain-http localhost passes App Transport Security on macOS.

END-OF-REPORT
