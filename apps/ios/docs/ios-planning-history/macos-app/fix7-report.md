# Fix batch 7: cancellation, settings reload, practice batch, chat turns

Diff: `git diff --cached -- Sources/Shared Sources/PostAnkiMac/MacRootView.swift Sources/PostAnkiMac/LanguageAdmin Packages/PostAnkiAPI/Sources/PostAnkiAPI/StudyToolsModels.swift Tests/PostAnkiMacSmokeTests/ReviewFixes3SmokeTests.swift` (the index also holds sibling files).

## Changes
1. Cancellation: 18 models and screens that caught only `CancellationError` now use `catch where ProgressLoadError.from(error) == nil` (learning list, categories, paths, recommendation, daily push, mapping, tags, course build and edit, global search, doc scan, study sessions, Notion import, source library, decide, domain priority, notes search, resurfacing gaps). `StudyToolsError.message` now answers "Loading was interrupted. Try again." for cancelled requests instead of the offline text. Left alone because they already handle both forms or are sibling-owned: due review, due today, pending review list, exercise screen.
2. Settings: `MacRootView` reacts to `.postAnkiSettingsDidSave` by clearing the language practice store, giving the detail screen a new identity (so the visible screen reloads) and refreshing the Review badge. `SettingsScreen` is unchanged: it already posts the notification after save, address reset and token removal, and iOS behavior is untouched.
3. Practice: new `Sources/Shared/PracticeModelStore.swift` keeps one `PracticeModel` per subject; `MacPracticeView` takes its model from it, so `start()` finds the batch and does not call the paid batch endpoint again. The store is cleared when settings are saved.
4. Chat: `Sources/Shared/ChatTranscriptWindow.swift` trims the sent transcript to the last 12 turns (the server reads 12). Used by `StudyChatModel` (ask, topic chat) and `KnowledgeItemChatModel`, which now shows the shared error messages (signed-out says to check Settings, 404 says the item is gone).

## Tests
`Tests/PostAnkiMacSmokeTests/ReviewFixes3SmokeTests.swift`: 8 tests (cancelled learning list and tags stay silent, cancelled message is not "offline", 150-turn chat sends 12, newest turns kept, signed-out knowledge chat message and draft kept, practice batch survives a switch with one batch request, store reset).

## Check results
- iOS scheme build: succeeded (private copy at /private/tmp/sC-spec, xcodegen run there, derived data /private/tmp/dd-sC).
- Mac scheme tests: my suite passes. The full run fails because of sibling work in progress, not my changes. The sibling `APIClient.swift` now uses a private `URLSession` with `RedirectGuard`, which ignores `URLProtocol.registerClass`, so the fake server is bypassed and 171 tests fail. With that one line pointed back to `URLSession.shared` in the private copy only, 6 failures remain, all in sibling queue suites (ScheduledReviewQueue, ServerBoundQueue, CrashGuard). The sibling needs to make the fake server work with its session, for example by registering the protocol in the session configuration.
- `npx tsc`, lint and vitest do not apply (Swift repo; no SwiftLint config).

## Defaults and notes
- Test target compiles only `Sources/Shared`, so the practice store lives there, not in the Mac folder.
- The badge refresh is skipped if a refresh is already running; a refresh started with the old token could land late (minor).
- Decide and study-session run stores are not cleared on settings save (not in these todos).

END-OF-REPORT
