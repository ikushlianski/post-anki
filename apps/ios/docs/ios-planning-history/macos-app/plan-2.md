# macOS app, round 2: a quality basic Mac app

state: confirmed (planned without questions; defaults logged below)

## Summary

The Mac app gains a Home screen, a knowledge browser and a Progress screen, plus the things a Mac user expects: menu commands and shortcuts, a Settings window on Cmd-comma, the pending count on the Review entry, the last sidebar entry and window frame remembered, an app icon and accent colour, and clear empty/offline/signed-out states everywhere. The shared API package gets its first unit tests, decoding sample server responses. No business rules change and the server is untouched; the iOS app must behave exactly as before.

Architecture is unchanged from plan.md: `Packages/PostAnkiAPI` is the data contract, `Sources/Shared` holds views/models compiled by both apps with small `#if os` guards, `Sources/PostAnkiMac` holds the Mac shell. This round moves more iOS screens' models and rows into `Sources/Shared` (moves use `git mv`; iOS files keep their iOS-only views) and adds a package test target.

## Current state (Facts, read from code)

- Sidebar enum `MacSidebarItem` lives in `Sources/PostAnkiMac/MacRootView.swift` (courses, review, ingest, settings); selection is `@State`, defaults to courses.
- The Review row already carries `.badge(PendingReviewCountStore.shared.count)` (plan.md decision 15). The store refreshes at launch, on app activation, and adjusts on approve/reject.
- `PostAnkiMacApp.swift`: one `Window` scene, `defaultSize(1000x700)`, min frame 760x520, flushes the grade queue on activation. No `Settings` scene, no `.commands`.
- No asset catalog exists in either target. Package has no test target; `APIClient` decodes with a plain `JSONDecoder()` (`Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift:58`).
- iOS Home: `HomeScreenModel` (in `HomeScreen.swift`), `HomeSummarySection.swift` (+`HomeSummaryModel`), `DueTodayModel` (in `DueTodayCard.swift`, row links to iOS-only `DueReviewScreen`), `LastStudied.swift` (course only, recorded by iOS `CoursesScreen`; the Mac courses view does not record it). iOS "Study now" opens practice, which the Mac does not have.
- iOS Progress: `ProgressModel` inside `ProgressScreen.swift`; rows in `ProgressRows.swift`. `ProgressLoadError.from(_:)` in the package already classifies offline / unauthorized / notFound / other and ignores cancellation.
- iOS knowledge browser: `KnowledgeListScreen.swift` (EditMode, `topBar*` placements, private `KnowledgeMoveSheet`), `KnowledgeListModel(+Bulk)`, `KnowledgeItemDetailScreen` (suspend/unsuspend/bury toggle, "generate more variants"; wording edits happen during review), `SuspendedKnowledgeScreen`. `MoreVariantsModel` is already in Shared.

## Decisions taken (defaults, logged; no questions asked)

1. Sidebar order after this round: Home, Courses, Review, Knowledge, Progress, Ingest. Home is the fallback selection. Settings leaves the sidebar once the Settings window exists (wave 4).
2. Mac "Study now" opens Review > Due today (no practice on Mac); disabled with "Nothing due" when the due total is 0. "Latest topic" = the last opened course (what `LastStudied` stores, same as iOS); its button switches to Courses (no deep link into the course; cut).
3. Knowledge "edit" keeps iOS parity: status changes (suspend/unsuspend/bring back), delete, move to subject, generate variants; wording is edited while reviewing (existing footer text). A free-text bit editor in the browser is cut (the overview item has no body/variant id).
4. Sidebar selection persists in `@AppStorage("mac.sidebarSelection")` (String raw values), not `@SceneStorage`, and the window frame via AppKit frame autosave: SwiftUI scene restoration is skipped when the system setting "Close windows when quitting an app" is on.
5. Menu commands drive navigation by writing the same AppStorage key, so no focused-value plumbing is needed.
6. Signed-out is detected from the server's 401 (existing rule), not from a missing local token.
7. Full-screen empty/error states only when nothing has loaded yet; with stale data on screen, failures show as an inline caption (the pattern `ProgressModel.sectionFailure` already uses).
8. Package tests use Swift Testing (`import Testing`), fixtures as bundle resources, plain `JSONDecoder()` to mirror the client. Fixture shapes are copied from the server's response schemas in the sibling repo `../post-anki` (read-only), never invented.
9. Badge stays sidebar-only; a Dock-icon badge is cut. No commits unless asked; each todo is one atomic commit if asked. Each wave ends with the orchestrator's build gate; agents never mark todos done.

## Contention points and owners

`MacRootView.swift`, `MacSidebarItem.swift` (created in wave 1), `PostAnkiMacApp.swift`, `project.yml`, `Package.swift`, `README.md`, `manual-test-sequence.md` each have exactly one owner per wave (named in each wave). Agents in a parallel wave use their own `-derivedDataPath /private/tmp/dd-mac2-<todo>`; a build error in a file another agent owns means re-run after that agent finishes, never edit it.

## Wave 1 (parallel, 4 agents, file-disjoint): badge, window restore, icon, package tests

**1a. Window restore** — owns `MacRootView.swift`, `PostAnkiMacApp.swift`, new `Sources/PostAnkiMac/MacSidebarItem.swift`, new `Sources/PostAnkiMac/MacWindowFrameAutosave.swift`.
- Move `MacSidebarItem` into its own file as `enum MacSidebarItem: String, CaseIterable` (adds `home`, `knowledge`, `progress` cases only in wave 3).
- `MacRootView`: `@AppStorage("mac.sidebarSelection")` string plus a computed `Binding<MacSidebarItem?>`; an unknown or nil stored value falls back to `.courses` (`.home` from wave 3).
- `MacWindowFrameAutosave`: tiny `NSViewRepresentable` that calls `window.setFrameAutosaveName("PostAnkiMainWindow")` once it is in a window; attached in `PostAnkiMacApp` as a background of the root view. `defaultSize` stays for first launch.
- Edge cases: stored frame on a disconnected monitor (AppKit constrains to a visible screen; verify); stored size below the minimum (min frame wins); deselecting the sidebar (nil) must not persist nil.
- Verify manually: resize, pick Ingest, quit (Cmd-Q), relaunch: same size, position and entry; also with "Close windows when quitting" on.

**1b. Badge** — owns `MacReviewView.swift` only.
- The badge already exists; add `.task { await PendingReviewCountStore.shared.refresh() }` so opening Review picks up items generated since launch (ingest produces them asynchronously).
- Verify a 0 count hides the badge on macOS and approve/reject/undo moves it. If the row modifier itself needs a change, hand it to the 1a owner (MacRootView is theirs this wave); none is expected.

**1c. App icon and accent** — owns `project.yml`, new `Sources/PostAnkiMac/Assets.xcassets/` (`AppIcon.appiconset`, `AccentColor.colorset`, `Contents.json`).
- `AppIcon`: the 10 macOS slots (16, 32, 128, 256, 512 at 1x and 2x) resized with `sips -z` from one 1024 master drawn by a throwaway script in the scratchpad (rounded tile, accent colour, card glyph); only PNGs and `Contents.json` are committed. `AccentColor` with light and dark values.
- `project.yml`, Mac target `settings.base` only: `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon`, `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor`. The catalog is picked up as a resource because it sits under `Sources/PostAnkiMac`. iOS target untouched.
- Verify: built `PostAnkiMac.app/Contents/Resources` contains `Assets.car` and `AppIcon.icns`; Info.plist has `CFBundleIconName = AppIcon`; Dock and Finder show the icon; buttons/selection use the accent.

**1d. API package tests** — owns `Packages/PostAnkiAPI/Package.swift`, new `Packages/PostAnkiAPI/Tests/PostAnkiAPITests/**`, `README.md` (one line on `swift test`).
- `Package.swift`: `.testTarget(name: "PostAnkiAPITests", dependencies: ["PostAnkiAPI"], resources: [.process("Fixtures")])`.
- Fixtures (JSON, realistic values, one with optional fields null/absent): review cards with counts, pending-review sources, knowledge overview page, curriculum detail, home summary, streak, weekly digest, retention report, milestones. Cover every model with a hand-written `init(from:)` that these responses reach.
- Tests (`describe`-style `@Suite`, names state the guarantee, e.g. "should report due counts per review state from the cards response", "should treat a dropped connection as offline, not signed out"): decode each fixture and assert business fields; `ProgressLoadError.from` maps URLError/401/404/cancellation.
- Edge: an app-side model change that breaks decoding now fails `swift test`; the app schemes do not run package tests (stays a separate command).

## Wave 2 (parallel, 3 agents, file-disjoint): Home, Knowledge, Progress screens

No agent touches `MacRootView`, `MacSidebarItem`, `PostAnkiMacApp` or `project.yml`; new views compile unwired until wave 3. Each new screen gets a toolbar Reload with Cmd-R (existing Mac convention) and `.task` loading.

**2a. Home** — owns `HomeSummarySection.swift`, `LastStudied.swift` (both `git mv` to Shared), `DueTodayCard.swift` and `HomeScreen.swift` (iOS; models split out), new `Sources/Shared/DueTodayModel.swift` (`DueTodayFailure`, `DueTodayModel`), new `Sources/Shared/HomeScreenModel.swift`, new `Sources/PostAnkiMac/MacHomeView.swift`, `MacCoursesView.swift`.
- `MacHomeView(onStudyNow:onOpenCourses:)`: "Today" (shared summary section: streak, stats, top subjects), "Due today" (total + breakdown from `DueTodayModel`, prominent Study now as default action), "Continue studying" (last course name, topic count, Open in Courses), "No course yet" empty view when nothing recorded.
- `MacCoursesView`: record `LastStudied` when a course detail opens (iOS parity).
- Edge: due load offline/401 shows the existing message text; summary failure shows its caption; last course deleted on the server (404) shows the course error and keeps the name.

**2b. Knowledge browser** — owns `KnowledgeListModel.swift`, `KnowledgeListModel+Bulk.swift`, `KnowledgeItemDetailScreen.swift`, `MoreVariantsSection.swift`, `SuspendedKnowledgeScreen.swift` (all `git mv` to Shared, guard `navigationBarTitleDisplayMode`), `KnowledgeListScreen.swift` (iOS; move sheet extracted), new `Sources/Shared/KnowledgeMoveSheet.swift` (private to internal, guarded, Mac min frame), new `Sources/PostAnkiMac/MacKnowledgeView.swift`.
- Mac list: native multi-select `List(selection:)` bound to the model's `selection` (no EditMode), subject filter picker, `.searchable`, rows with question, status and due, load-more on the last row.
- Actions: Return/double-click opens the shared detail (suspend/unsuspend/bring back, generate variants); Delete key (`onDeleteCommand`) and toolbar Delete with a confirmation dialog; "Move to Subject…" (Cmd-Shift-M) opens the move sheet; toolbar link to Suspended items.
- Edge: selection over the model's limit disables bulk actions with its message; partial bulk results show the model's existing summary; an item deleted elsewhere (gone) drops from the list; detail state change updates the row via the existing callback.

**2c. Progress** — owns `ProgressRows.swift` (`git mv` to Shared), `ProgressScreen.swift` (iOS; model split out), new `Sources/Shared/ProgressModel.swift`, new `Sources/PostAnkiMac/MacProgressView.swift`.
- Mac layout: streak and week tiles in a grid (streak from the weekly digest, so no dependency on Home's model), Coverage, Concerns, Retention (all time), Milestones; widths suited to a wide window.
- Edge: all three calls fail before first load shows the full error with Try again; one fails shows the section caption; no milestones shows the existing empty view.

## Wave 3 (one owner): wire the new screens into the sidebar

Owns `MacSidebarItem.swift` and `MacRootView.swift`. Add `home`, `knowledge`, `progress` cases (title, SF Symbol), order per decision 1, fallback `.home`; detail cases for `MacHomeView` (closures set the selection to review/courses), `MacKnowledgeView`, `MacProgressView`. Manual: every entry opens; Study now lands on Due today.

## Wave 4 (one owner): menu commands and Settings window

Owns `PostAnkiMacApp.swift`, `MacRootView.swift`, `MacSidebarItem.swift`, new `Sources/PostAnkiMac/MacCommands.swift`, `README.md` (shortcut list).
- `Settings { SettingsScreen() }` scene with a fixed width; the app menu gets "Settings…" Cmd-comma automatically. Remove the Settings sidebar case; root passes `onOpenSettings` as `openSettings()` (macOS 14 environment action), so due review's "Open Settings" opens the window.
- `.commands`: `SidebarCommands()`, `ToolbarCommands()`; replace `.newItem` with "New Knowledge Item" Cmd-N (selects Ingest; also guarantees no second window); "Go" menu with Home Cmd-1 through Ingest Cmd-6 writing the AppStorage key. Per-screen Cmd-R Reload stays on toolbars; review digits 1-4 stay view-level (never menu items, they would steal typing).
- Edge: stored selection "settings" from an older run falls back to Home; Go commands while a sheet is open change the entry underneath (acceptable); Settings window open while saving a token then Try again in review loads cards.

## Wave 5 (one owner): empty, offline and signed-out states on every Mac screen

Owns new `Sources/PostAnkiMac/MacLoadStateView.swift`, `Sources/Shared/CoursesModels.swift` (additive `failure: ProgressLoadError?` next to `errorMessage`; iOS keeps reading `errorMessage`), all `Sources/PostAnkiMac/*View.swift` screens, `#if os(macOS)` touches in `PendingReviewScreen.swift` / `IngestionDictationScreen.swift` only where their current text is wrong for Mac, and `manual-test-sequence.md` (sections for all nine todos).
- One Mac state view: offline ("You're offline", Try again), signed out ("Add your access token", `SettingsLink` + Try again), other (Try again), empty (per-screen title, symbol, next step). Mac copy never says "pull to refresh".
- Apply to Home, Courses list and detail, Due review (replaces the inline unauthorized view), Pending items, Knowledge (also "no matches" for a search), Suspended, Progress, Ingest submit failure.
- Edge: cancellation shows nothing (classifier returns nil); stale data plus failure shows the inline caption (decision 7); offline grades still queue and flush on activation.

## Verification (every agent, then the orchestrator's gate after each wave)

```sh
cd /Users/ikushlianski/webdata/ilya-projects/post-anki-ios
xcodegen generate
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/dd-mac2-<todo> CODE_SIGNING_ALLOWED=NO build
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -destination 'generic/platform=macOS' \
  -derivedDataPath /private/tmp/dd-mac2-<todo> CODE_SIGNING_ALLOWED=NO build
swift test --package-path Packages/PostAnkiAPI      # from wave 1 on
```
Both schemes BUILD SUCCEEDED with no new warnings; tests pass. GUI checks (restore, icon, menus, Settings window, states) are manual and listed in `manual-test-sequence.md`. Any edit under `Sources/Shared` needs both schemes green before handing off.

## Risks

- Parallel agents share one generated `.xcodeproj`; a sibling's half-written file can fail your build. Mitigated by per-agent derived data and the retry rule; the wave gate is authoritative.
- Moving iOS models to Shared can surface iOS-only modifiers; guard only what the macOS compiler rejects.
- Fixture drift: fixtures copied from today's server schemas go stale when the server changes; that is the point (a failing test flags the contract change).
- Ad-hoc signing changes the code signature each build, which may reset keychain trust (existing README note) but not AppStorage or the frame autosave.

## Scope boundary (cut, `added`)

Dock badge; deep link from Home into a specific course or topic; a wording editor in the knowledge browser; Mac practice/exercise; iOS app icon; running package tests inside the app schemes; multiple windows.
