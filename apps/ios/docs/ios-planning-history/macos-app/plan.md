# Plan: macOS app (direction `macos-app`)

Complexity: Complex (new app target, new module boundary, cross-platform view sharing). Plan depth: Opus, medium-to-high.
Out of scope (from todo.md Scope): server changes, OpenAPI generation, iOS features beyond the core loop.

## Summary

The learner gets a native Mac app for the core study loop: browse courses, review due cards and pending items, add knowledge by typing or pasting, and set the server address and token. Both apps decode the server through one shared Swift package, so a model change is made once and both apps pick it up. iOS behaviour does not change; every step leaves both apps building.

## Architecture (current-state target)

- **`PostAnkiAPI` local Swift package** (`Packages/PostAnkiAPI`) owns the whole former `Sources/PostAnkiIOS/API` folder: HTTP client, all request/response models, `TokenStore`. It knows nothing about SwiftUI or app state. Both apps depend on it.
- **`Sources/Shared/`** is a plain source folder compiled into both app targets. It holds the core-loop view models, the offline grade queue, and the leaf/whole views that compile on both platforms. Platform differences sit behind small `#if os(iOS)` / `#if os(macOS)` guards.
- **`Sources/PostAnkiIOS/`** keeps the iOS-only app (tab bar, Home, practice, study tools, everything outside the core loop).
- **`Sources/PostAnkiMac/`** holds the Mac app shell: single main window with sidebar + detail, and the Mac-specific screens (courses composition, keyboard-first due review).

Why a shared folder for UI and not the package: the shareable views depend on app-level singletons (`PendingReviewCountStore`, `PendingGradeQueue`) and on each other; putting them in a package would force a second large `public` surface and a module split for no gain. A folder listed in both targets' `sources` costs one line of `project.yml` each and keeps one copy of every file. The package stays a clean data-contract boundary, which is what the user decided.

Data ownership is unchanged: server is source of truth; each app keeps its own settings (UserDefaults), token (Keychain) and offline grade file (Application Support). The Mac and iOS apps do not share local storage (different devices, different bundle IDs), so no Keychain access group or App Group is needed.

## Decisions taken (defaults, logged; no questions asked)

1. Package name `PostAnkiAPI`, path `Packages/PostAnkiAPI`, `swift-tools-version: 6.0` (Swift 6 language mode), platforms `.iOS(.v17)`, `.macOS(.v14)`, one library product, no test target.
2. Every type in the package and every member the apps touch becomes `public`. Internal plumbing stays internal: `APIClient.request`, `canSendToken`, `AnyEncodable`, `APIErrorBody`, `AdminScanValue`, private `CodingKeys`.
3. Add `import PostAnkiAPI` to each app file that uses an API symbol (no `@_exported` re-export; it is an underscored attribute).
4. Shared UI lives in `Sources/Shared/` (reasoning above). Filenames follow the repo's existing PascalCase Swift convention, not kebab-case.
5. Mac bundle id `com.ikushlianski.postankimac`, target/scheme `PostAnkiMac`, display name "PostAnki", category education. Sandbox on, `com.apple.security.network.client` only. No hardened runtime, no notarization.
6. Mac uses a single `Window` scene (not `WindowGroup`) so two windows cannot run two review sessions that grade the same card.
7. Mac "Ingest" means the existing type-or-dictate add-knowledge screen (`IngestionDictationScreen`), not the iOS tab also named Ingest (that tab confirms question variants and is not in the core loop). macOS system dictation works in the text editor with no custom code.
8. Mac "Review" is one sidebar entry with a segmented picker: "Due today" (scheduled cards) and "Pending items" (approve/reject new knowledge).
9. Mac courses: subjects and courses list, then course detail with modules and topics; each topic offers "Add knowledge" (ingest scoped to that topic's subject). Practice/exercise, course editing, stats and organize sections stay iOS-only.
10. Keyboard-first due review: answer field focused on each card; Return reveals the answer next to what was typed; keys 1-4 grade Again/Hard/Good/Easy; grading moves straight to the next card (existing model behaviour) and refocuses the field, so Return is the only "next" key needed. Return after reveal does nothing (no accidental grade). The typed answer is for self-comparison only and is not sent to the server (record-review input has no answer field). Edit and Undo stay as toolbar buttons without shortcuts (Cmd-Z belongs to the text field).
11. Add-knowledge on Mac: Cmd-Return submits (plain Return is a newline in the editor). Paste is native.
12. Settings is a sidebar entry only (asked). A Cmd-comma Settings scene is `added` and cut.
13. Mac Keychain: file-based login keychain (the SecItem default; current `kSecAttrSynchronizable = false` already keeps it there). Not the data-protection keychain, which needs a provisioning-profile-backed application identifier and fails with -34018 under "Sign to Run Locally" (Apple TN3137). `kSecAttrAccessible` is a data-protection-only attribute, so it is set only on iOS.
14. Mac UserDefaults: `UserDefaults.standard` is redirected into the sandbox container automatically; no entitlement, no suite name.
15. Sidebar "Review" row shows the pending count badge (reuses the existing count store; one modifier).
16. No commits unless the user asks; each step is shaped to be one atomic commit if asked.

## Public-surface strategy (Step 1)

Mechanical pass over the 55 moved files, rebuilding after each bullet:
- `public` on every top-level `struct`/`enum` (~280), nested types, enum declarations (cases follow), stored `let`/`var` properties, computed properties (`id`, `stateLabel`, etc.), `static let` constants (`rejected`, `all`, `levels`, `packs`), and every `static func` in the `APIClient` extensions. Also `APIClient` itself and `baseURLString`, `APIError`, `TokenStore` (`read`/`save`/`clear`), `TokenStoreError` and its `status`, `ReviewGrade`, `IntervalFormat` and its functions.
- Hand-written `init(from:)` / `encode(to:)` (13 sites) become `public` (protocol requirements of a public type must be public).
- **Explicit `Sendable` on every public struct/enum.** Implicit Sendable is only inferred for non-public types; once public, the ~43 models without an explicit `Sendable` stop being Sendable and Swift 6 rejects them as `static let` values and when async results cross into `@MainActor` view models. All stored properties are Strings/numbers/arrays/optionals of models, so plain `Sendable` is valid; no `@unchecked`.
- **Public memberwise inits.** A public struct's synthesized memberwise init stays internal. The apps construct 18 model types directly, so each gets a hand-written `public init` matching the current memberwise signature (same labels, order and defaults): `ChatTranscriptEntry, CourseBuildCreateInput, CourseBuildSourceInput, CreateStudySessionInput, CurateGapInput, Curriculum, DeclareGapInput, KnowledgeOverviewItem, PendingRejectFeedback, PendingReviewBulkApprovalResult, PendingReviewRemovedBit, PendingReviewSource, PendingReviewUndo, PhraseAnswerInput, PracticeSettingsInput, RecordReviewInput, ReviewCard, StudyChatTurn`. Any further "initializer is inaccessible" error adds to this list; no speculative inits.
- App-side extensions on package types (`KnowledgeOverviewItem.label(for:)`, `CourseBuildCourse.asCurriculum`) keep working once the inits/properties they use are public. An app-side protocol conformance on a package type would need `@retroactive`; none exist today.
- `TokenStore`: no `kSecAttrAccessGroup`. Wrap the `kSecAttrAccessible` line in `#if os(iOS)` here, since `swift build` already compiles the package for macOS.

## Step 1 — Extract the API into the `PostAnkiAPI` package (todo 3)

Behaviour: none visible; the iOS app works exactly as before.

Files:
- New `Packages/PostAnkiAPI/Package.swift`.
- `git mv Sources/PostAnkiIOS/API/*.swift Packages/PostAnkiAPI/Sources/PostAnkiAPI/` (all 55; keeps history and current staging).
- Edit all moved files per the public-surface strategy.
- `project.yml`: top-level `packages: { PostAnkiAPI: { path: Packages/PostAnkiAPI } }`; iOS target `dependencies: [{ package: PostAnkiAPI }]`.
- `Sources/PostAnkiIOS/*.swift`: add `import PostAnkiAPI` wherever an API symbol is used (nearly all ~90 remaining files).

Verification:
```sh
cd /Users/ikushlianski/webdata/ilya-projects/post-anki-ios
swift build --package-path Packages/PostAnkiAPI            # package alone, host macOS
xcodegen generate
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/dd-macos-app \
  CODE_SIGNING_ALLOWED=NO build
test -z "$(ls Sources/PostAnkiIOS/API 2>/dev/null)"         # folder gone
```
All exit 0, no new Sendable or access-level warnings. The macOS app build starts in Step 2; `swift build` proves the package compiles for macOS now.

## Step 2 — macOS target with courses, review and ingest (todo 2)

Behaviour: running `PostAnkiMac` from Xcode opens one window with a sidebar (Courses, Review, Ingest; Settings arrives in Step 3). Courses lists subjects/courses and opens a course's modules and topics with an "Add knowledge" action per topic. Review switches between keyboard-first due cards and the pending-items list (approve, reject with reason, edit, approve all, undo reject, regenerate). Ingest is the type-or-paste add-knowledge screen with "Review new items" after sending. A toolbar Reload (Cmd-R) on Courses replaces pull-to-refresh. Without a token the server answers 401; due review shows "Add your token in Settings" with Try again, other screens show their existing error text.

`project.yml`:
- `options.deploymentTarget` gains `macOS: "14.0"`.
- Move `PRODUCT_BUNDLE_IDENTIFIER` and the two `INFOPLIST_KEY_UI*` keys from project-level `settings.base` into the iOS target (iOS-only; the Mac target needs its own id).
- iOS target `sources`: `Sources/PostAnkiIOS`, `Sources/Shared`.
- New target `PostAnkiMac`: `type: application`, `platform: macOS`, `deploymentTarget: "14.0"`, sources `Sources/PostAnkiMac` + `Sources/Shared`, dependency on package `PostAnkiAPI`, `entitlements: { path: Config/PostAnkiMac.entitlements, properties: { com.apple.security.app-sandbox: true, com.apple.security.network.client: true } }` (XcodeGen writes the file; commit it), settings `PRODUCT_BUNDLE_IDENTIFIER: com.ikushlianski.postankimac`, `INFOPLIST_KEY_CFBundleDisplayName: PostAnki`, `INFOPLIST_KEY_LSApplicationCategoryType: public.app-category.education`, `scheme: {}`. Signing still comes from `Config/Base.xcconfig` → `Local.xcconfig`.

Move to `Sources/Shared/` with `git mv`, guarding only what the macOS compiler rejects:
- `DueReviewModel.swift`, `DueReviewModel+Edit.swift`, `DueReviewModel+Helpers.swift`, `PendingGradeQueue.swift` (unchanged; Application Support resolves inside the sandbox container).
- `QuestionVariantEditSheet.swift` (guard `navigationBarTitleDisplayMode`).
- `PendingReviewListModel.swift` (+`BulkUndo`, +`Feedback`), `PendingReviewRows.swift`, `PendingReviewEditSheet.swift` and `RejectReasonSheet.swift` (guard `navigationBarTitleDisplayMode`), `PendingReviewUndoBanner.swift`, `SourceRegenerationRow.swift`, `SourceRegenModel.swift`.
- `PendingReviewCountStore.swift`: `import UIKit` + `UIApplication.didBecomeActiveNotification` become `#if os(iOS)` UIKit / `#else` AppKit `NSApplication.didBecomeActiveNotification`.
- `PendingReviewScreen.swift`: guard the `.topBarLeading` "All items" link (`KnowledgeListScreen` stays iOS-only).
- `IngestionDictationScreen.swift`: guard `presentationDragIndicator`; `#if os(macOS)` Cmd-Return on Submit and a minimum frame for the review sheet.
- New `Sources/Shared/DueReviewGradeButtons.swift`: `DueReviewGradeButtons` moved out of `DueReviewScreen.swift`, with `#if os(macOS)` digit `keyboardShortcut` per grade (1-4, no modifiers).
- New `Sources/Shared/DueReviewStateViews.swift`: `DueReviewEmptyView`, `DueReviewMessageView`, `DueReviewPendingCaption` moved out of `DueReviewScreen.swift` (private → internal) so the Mac view reuses them. `DueReviewUnauthorizedView` and `DueReviewCardView` stay in the iOS file.
- New `Sources/Shared/CoursesModels.swift`: `CoursesScreenModel` and `CurriculumDetailScreenModel` moved out of `CoursesScreen.swift` unchanged.

New in `Sources/PostAnkiMac/`:
- `PostAnkiMacApp.swift` — `@main`, single `Window` scene with default size; flushes `PendingGradeQueue` on activation.
- `MacRootView.swift` — `NavigationSplitView`; sidebar selection enum (courses, review, ingest; settings in Step 3); review row `.badge` from the count store.
- `MacCoursesView.swift` — list + detail on the shared course models; topic row "Add knowledge" pushes `IngestionDictationScreen(topic:subjectId:)`; Reload (Cmd-R).
- `MacReviewView.swift` — segmented picker (Due today / Pending items) hosting `MacDueReviewView` or the shared `PendingReviewScreen`.
- `MacDueReviewView.swift` — driven by `DueReviewModel`: `@FocusState` answer field, `onSubmit` → `reveal()`, field disabled once revealed (so digit keys reach the grade buttons), "Your answer" vs real answer and background, shared grade buttons, grade-error Retry, Edit/Undo toolbar buttons with the shared edit sheet, shared empty/error/pending-caption views, unauthorized message with Try again. On `current` change: clear typed text, refocus.

Edge cases in this step:
- Grade keys while a grade is in flight: buttons are disabled by `isGrading`, and disabled buttons ignore their shortcuts.
- Empty typed answer + Return still reveals.
- Card edited or undone: the card reappears unrevealed; typed text cleared, field refocused.
- Offline: grades queue to the sandboxed Application Support file and flush on next activation (existing queue logic).
- Pending review open from Ingest's "Review new items" sheet and from the sidebar: both share the count store; the sheet's `NavigationStack` works on macOS; the minimum frame stops Form clipping.
- Plain-HTTP non-localhost address: ATS blocks it on macOS as on iOS; the token is never sent over plain HTTP (existing client rule).

Verification:
```sh
xcodegen generate
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/dd-macos-app \
  CODE_SIGNING_ALLOWED=NO build
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac \
  -destination 'generic/platform=macOS' -derivedDataPath /private/tmp/dd-macos-app \
  CODE_SIGNING_ALLOWED=NO build
# signed build (team from Local.xcconfig, or ad-hoc), then confirm the entitlements are embedded:
xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -destination 'generic/platform=macOS' \
  -derivedDataPath /private/tmp/dd-macos-app build
codesign -d --entitlements :- /private/tmp/dd-macos-app/Build/Products/Debug/PostAnkiMac.app
```
Expect `app-sandbox` and `network.client` true. Manual: launch from Xcode, open each sidebar entry, type an answer, Return, press 2, confirm the next card loads with the field focused.

Docs: README gains a "macOS app" paragraph (scheme, build command, sandbox note, `Local.xcconfig` signing).

## Step 3 — macOS settings: server address and token (todo 1)

Behaviour: sidebar "Settings" shows the same form as iOS (address, token, Save, Remove token). The token goes to the Mac login keychain under the same service name as iOS; the address goes to the app's sandboxed preferences. The due-review unauthorized state gains "Open Settings", which switches the sidebar to Settings; Try again then loads cards.

Files:
- `git mv Sources/PostAnkiIOS/SettingsScreen.swift Sources/Shared/`; guard `.keyboardType(.URL)`, `.textInputAutocapitalization(.never)` and `SettingsToolsSection()` with `#if os(iOS)`; `#if os(macOS)` `.formStyle(.grouped)`.
- `TokenStore.swift` in the package: confirm the Step 1 `kSecAttrAccessible` guard; no access group.
- `MacRootView.swift`: settings selection case and sidebar row.
- `MacDueReviewView.swift`: "Open Settings" via an `onOpenSettings` closure from the root view.

Edge cases:
- Ad-hoc ("Sign to Run Locally") builds change the code signature each build, so the login keychain may prompt "PostAnki wants to use your confidential information" or refuse the earlier item. `DEVELOPMENT_TEAM` in `Local.xcconfig` gives a stable signature; README notes this.
- Saving an address does not reload already-loaded screens (same as iOS); Reload/Try again picks it up.
- Token whitespace is trimmed and non-printable characters rejected (existing rule).
- Removing the token mid-session: next request returns 401 and the unauthorized state shows.

Verification: the same xcodegen + iOS + macOS builds as Step 2, plus manual: save a token, quit, relaunch, Settings shows "Token saved"; Keychain Access app lists an item for service `com.ikushlianski.postankiios.api`; Remove token clears it; the address persists across relaunch.

## Risks

- **Large mechanical diff in Step 1** (~55 package files, ~90 import lines). Build the package alone first, then the app; let compiler errors drive the init/visibility list.
- **Uncommitted staged work.** The index already holds many staged, uncommitted files (including the API folder). `git mv` preserves staging, but the user should commit the current baseline before Step 1 so each step's diff is reviewable. Not done automatically.
- **Bare-digit shortcuts vs. text input.** Mitigated by disabling the answer field once revealed; verify by hand that "1" grades instead of typing.
- **XcodeGen syntax** for local packages (`packages.<name>.path`, `dependencies: - package:`) and `entitlements.properties`: confirm against XcodeGen 2.46 ProjectSpec while implementing; `xcodegen generate` fails loudly if wrong.
- **Keychain prompts on ad-hoc builds** (Step 3); data-protection keychain avoided on purpose.
- **Shared-folder drift:** an iOS-only API added later to a shared file breaks the Mac build. Both schemes must build before any commit touching `Sources/Shared/`.

## Scope boundary (cut, `added`)

Cmd-comma Settings scene; Mac practice/exercise, course editing, stats, knowledge list, study tools; file drop; custom speech; OpenAPI generation; package unit tests; sharing data between the Mac and iOS apps.
