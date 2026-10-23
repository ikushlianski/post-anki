# Architecture

The repo builds two apps from one codebase: an iOS app (`PostAnkiIOS`) and a Mac app (`PostAnkiMac`). Both talk to the post-anki server through one Swift package and share most screens.

```
Packages/PostAnkiAPI     network client, models, token store (both apps)
Sources/Shared           screens, view models, queues (both apps compile it)
Sources/PostAnkiMac      Mac shell: sidebar registry, palette, menus, launch check
Sources/PostAnkiIOS      iOS shell: home screen and a few iOS-only screens
Tests/                   Mac smoke tests and registry tests
```

## The API package

`Packages/PostAnkiAPI` (`Package.swift`, iOS 17 and macOS 14) is the only code that talks to the network.

- Client: `Sources/PostAnkiAPI/APIClient.swift` holds the shared request path. Endpoints are grouped by feature in `APIClient+<Feature>.swift` files (for example `APIClient+StudyTools.swift`). Each endpoint is a static function that returns a decoded model.
- Models: `Models.swift` plus one `<Feature>Models.swift` per feature (for example `ProgressModels.swift`).
- Token: `TokenStore.swift` keeps the access token in the Keychain and caches it in memory after the first read.
- Redirects: `RedirectGuard.swift` refuses any redirect that changes host, or that downgrades from https, so the token never follows a redirect elsewhere.
- Failure log: `RequestFailure.swift` keeps the last 50 failed requests (method, path, status, kind). Query values are dropped and only parameter names stay, so no tokens or search text reach the log. Cancelled requests are not recorded.
- Paths: `RequestPath.swift` builds encoded paths and query strings.
- Test hook: `APIClient.useProtocolClasses(_:)` swaps the URL session's protocol classes so tests can serve fake replies.

Package tests live in `Packages/PostAnkiAPI/Tests/PostAnkiAPITests` and decode sample server responses from `Fixtures/`. Run them with `swift test --package-path Packages/PostAnkiAPI`.

## Token and server address

- The token is never written to defaults or files. `TokenStore.save` trims it, rejects non-ASCII or whitespace inside it, and an empty value clears it.
- `APIClient.makeRequest` adds `Authorization: Bearer ...` only when the address is `https`, `localhost` or `127.0.0.1`.
- The server address is picked in this order: the address saved in Settings (defaults key `apiBaseURL`), then a Debug-only fallback, then the production address in `APIClient.productionBaseURLString`.
- The Debug fallback comes from `POSTANKI_DEV_API_URL` in `Local.xcconfig`. The Mac `Info.plist` exposes it as `PostAnkiDevAPIURL`, and `MacLaunchCheck.applyDevAddress()` passes it to `APIClient.setFallbackBaseURL` in Debug builds only.
- `Sources/Shared/ServerScope.swift` turns the current address into a normalised string. The offline queues and caches (`PendingGradeQueue.swift`, `PendingAnswerQueue.swift`, `VariantCache.swift`) store it with each entry so data saved for one server is not used for another.

## Shared screens

`Sources/Shared` is compiled into both apps (`project.yml` lists it as a source of `PostAnkiIOS`, `PostAnkiMac` and `PostAnkiMacSmokeTests`). It holds the screens (`*Screen.swift`), their view models (`*Model.swift`), sheets, and the offline queues (`PendingGradeQueue.swift`, `PendingAnswerQueue.swift`, `PendingQueueFlusher.swift`).

Rules for this folder:

- View models are `@Observable @MainActor` classes. A screen owns its model with `@State`.
- Platform differences use `#if os(iOS)` or `#if os(macOS)` inside the file. Examples: `PlatformCompat.swift`, `SettingsScreen.swift`, `PendingReviewScreen.swift`. `MacLoadStateView.swift` is wrapped entirely in `#if os(macOS)`.
- Do not use UIKit or AppKit types without a guard. A change here must build in both schemes.
- App-wide stores shared by both apps are singletons here, for example `PendingReviewCountStore.shared` (the Review badge count) and `PracticeModelStore.swift`.

## Mac shell

`Sources/PostAnkiMac` contains views that wrap shared screens in a Mac layout (lists, toolbars, context menus) and the navigation code.

- Entry: `PostAnkiMacApp.swift` defines the main window, the Keyboard Shortcuts window and the Settings scene. At startup it applies the Debug address and starts `MacQueueFlushTrigger`.
- Root: `MacRootView.swift` draws the sidebar from the registry, stores the selected id in defaults (`mac.sidebarSelection`), remembers collapsed groups, and shows the launch banner above the detail view.
- Registry: `Navigation/MacFeature.swift` defines a feature (id, group, order, title, icon, optional shortcut, optional badge, detail closure). `Navigation/MacFeatureRegistry.swift` joins the lists from `Features/*.swift`, sorts them by group then order, and validates them.
- Feature lists: one file per area in `Features/` (`MacCoreFeatures.swift`, `MacLibraryFeatures.swift`, `MacLearnFeatures.swift`, and so on).
- Detail host: `Navigation/MacFeatureDetailView.swift` wraps each detail in a `NavigationStack` unless the feature sets `ownsStack`.
- Navigator: `Navigation/MacNavigator.swift` writes a feature id to the same defaults key the sidebar reads. Views reach it through the `macNavigator` environment value.
- Palette: `Palette/MacCommandPaletteView.swift` (Cmd-K) filters registry entries using `Palette/MacCommandPaletteMatcher.swift` and jumps with the navigator. `Palette/MacShortcutHelp.swift` lists shortcuts in the help window.
- Menus: `MacCommands.swift` holds the app-wide menu commands and shortcuts.
- Launch check: `Launch/MacLaunchCheck.swift` makes one request at launch and classifies the result as no token, signed out, offline, unreachable or server error. `MacRootView` shows it as a banner with the current address.
- Queue flush: `Launch/MacQueueFlushTrigger.swift` sends queued offline grades and answers when the app becomes active and when the network returns.
- App-wide stores: `PendingReviewCountStore.shared` feeds the Review badge. `StudyModes/MacStudySessionRunStore.swift` keeps one run model per study session id, and `Sources/Shared/PracticeModelStore.swift` does the same per practice subject.
- Shared Mac helpers: `MacDestructiveConfirmation.swift` (confirm before delete or dismiss) and `Library/MacLibrarySupport.swift` (a helper that runs work with a concurrency limit).

### Registry validation

`MacFeatureRegistry.validationProblems()` reports duplicate ids, duplicate shortcuts, shortcuts that clash with reserved ones (Cmd-N, Cmd-R, Cmd-F, Cmd-comma, Cmd-K, Cmd-Shift-M, Cmd-Option-S), a missing `home` fallback, and an unknown stored id that does not fall back to `home`. Debug builds assert on it at launch, and `PostAnkiMacRegistryTests` checks it on every test run.

## iOS shell

`Sources/PostAnkiIOS` starts at `PostAnkiIOSApp.swift`, which shows `HomeView.swift`. The home sections (`HomeDailySection.swift`, `HomePracticeSection.swift`, and others) and a few screens (`CoursesScreen.swift`, `ProgressScreen.swift`) are iOS-only. Most other screens come from `Sources/Shared`.

## Error and load-state conventions

- `ProgressLoadError` (in the package, `ProgressModels.swift`) has four cases: `offline`, `unauthorized`, `notFound`, `other`. `ProgressLoadError.from(_:)` maps an error to a case, and returns `nil` for a cancellation (`CancellationError` or `URLError.cancelled`).
- A cancellation is not a failure. A model's `load()` treats a `nil` result as "stop quietly": no error text, no failure kind, `isLoading` reset.
- Models that can fail on load expose `isLoading`, `hasLoaded`, `loadError` (text) and `failureKind` (`ProgressLoadError?`).
- When a request can return after the user changed the input (a filter, for example), the model captures the requested value and drops the reply if it no longer matches.
- Mac views show failures with `MacLoadStateView` (title, icon and advice per case, an Open Settings link when unauthorized, and a Try again button) and empty results with `MacEmptyStateView`. Both are in `Sources/Shared/MacLoadStateView.swift`.
- Show a load failure only when there is nothing to display; keep existing items on screen if a reload fails.
- Cmd-R reloads the current screen through a toolbar button with `.keyboardShortcut("r", modifiers: .command)`.

## Tests

- Package tests: `Packages/PostAnkiAPI/Tests/PostAnkiAPITests` (decoding, redirect guard, request failure log, token cache, path encoding).
- `PostAnkiMacSmokeTests` (`Tests/PostAnkiMacSmokeTests`): compiles `Sources/Shared` directly and runs models against `FakeServer.swift`, a `URLProtocol` that answers by path with a fixture file, a status code or a network failure. Fixtures come from `Packages/PostAnkiAPI/Tests/PostAnkiAPITests/Fixtures`. Suites are grouped by area (`LibrarySmokeTests.swift`, `LearnAndAdminSmokeTests.swift`, and so on) as extensions of `SmokeTests`.
- `PostAnkiMacRegistryTests` (`Tests/PostAnkiMacRegistryTests/MacFeatureRegistryTests.swift`): hosted inside the Mac app and imports it with `@testable`, so it can read the registry.
- Both Mac test targets run under the `PostAnkiMac` scheme (Cmd-U). `scripts/run-mac.sh --test` runs them, then the package tests.

## Generated project file

`PostAnkiIOS.xcodeproj` is generated from `project.yml` by XcodeGen and is gitignored. A single hand-edited `.xcodeproj` would conflict on every merge and list files by hand; `project.yml` lists folders instead, so new files in `Sources/` are picked up on the next generation. Run `xcodegen generate` after pulling, after adding or moving files, and after editing `project.yml`. Signing settings go in `Local.xcconfig` (gitignored, template `Local.xcconfig.example`), because anything set in Xcode's UI is overwritten on regeneration. `Config/` holds `Base.xcconfig`, the Mac `Info.plist` and the Mac entitlements (sandbox, outgoing network only).

## Add a Mac feature

1. Add the API call and models to `Packages/PostAnkiAPI/Sources/PostAnkiAPI` (an `APIClient+<Feature>.swift` and a `<Feature>Models.swift`) if the endpoint does not exist. Add a fixture and a decoding test in the package tests.
2. Put the view model and the reusable screen parts in `Sources/Shared`. Follow the load-state conventions above and guard platform-specific code with `#if os`.
3. Write the Mac view in the matching `Sources/PostAnkiMac/<Area>/Mac<Name>View.swift`. Use `MacLoadStateView` and `MacEmptyStateView`, `.task` for the first load, a Reload toolbar button on Cmd-R, and `macConfirmDestructive` for deletes.
4. Declare a `MacFeature` in the matching `Features/Mac<Area>Features.swift` list: a unique `id`, a group (`.study`, `.library`, `.learn`, `.manage` or `.admin`), an `order` within the group, a title, an SF Symbol, and `detail: { _ in AnyView(Mac<Name>View()) }`. Add a `shortcut` only if it is free and not reserved; add a `badge` only for a live count. A new area file must also be added to the list in `MacFeatureRegistry.features`.
5. Run `xcodegen generate` so the new files join the targets.
6. Add a smoke test in `Tests/PostAnkiMacSmokeTests` for the load, failure and cancellation paths using `FakeServerSession`.
7. Build both schemes (the Shared folder feeds both) and run Cmd-U. The registry tests catch duplicate ids and shortcuts. The palette and sidebar pick up the entry with no more wiring.
8. Update the sidebar and shortcut lists in `README.md` if they changed.

### Worked example: Open questions

1. API: `APIClient.openQuestions(status:)` and `resolveOpenQuestion(id:status:answerText:)` in `Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient+StudyTools.swift`.
2. Shared: `Sources/Shared/OpenQuestionsScreen.swift` defines `OpenQuestionsModel` with `filter`, `items`, `isLoading`, `hasLoaded`, `loadError` and `failureKind`. Its `load()` captures the requested filter, drops stale replies, and returns quietly when `ProgressLoadError.from(error)` is `nil`.
3. Mac view: `Sources/PostAnkiMac/Learn/MacOpenQuestionsView.swift` owns the model with `@State`, loads with `.task(id: model.filter)`, shows `MacLoadStateView` when the first load fails, `MacEmptyStateView` when the list is empty, and a list with a context menu otherwise. Dismiss goes through `macConfirmDestructive`.
4. Registry: in `Sources/PostAnkiMac/Features/MacLearnFeatures.swift`:

```swift
MacFeature(
    id: "open-questions",
    section: .learn,
    order: 50,
    title: "Open questions",
    systemImage: "questionmark.bubble",
    detail: { _ in AnyView(MacOpenQuestionsView()) }
)
```

5. Tests: `openQuestionsCancelled` in `Tests/PostAnkiMacSmokeTests/ReviewFixesSmokeTests.swift` checks that a cancelled load leaves no error and `isLoading` false.
