# ex6: keep unsent text when switching sidebar entries

Diff: git diff --cached -- Sources/Shared/UnsentDraftStore.swift Sources/Shared/IngestScreen.swift Sources/Shared/WritingCheckModel.swift Sources/Shared/AskScreen.swift Sources/PostAnkiMac/Practice/MacQuickPracticeView.swift Sources/PostAnkiMac/LanguageAdmin/MacWritingCheckView.swift Sources/PostAnkiMac/Learn/MacAskView.swift Sources/PostAnkiMac/Learn/MacDecideView.swift Tests/PostAnkiMacSmokeTests/UnsentDraftSmokeTests.swift

## What changed
- New in-memory store (Sources/Shared/UnsentDraftStore.swift): singleton, keys are server + screen + subject/variant, empty text removes the entry, 10,000 characters per draft, 40 drafts (oldest evicted), never written to disk or logged. No root edit needed (singleton, same pattern as PracticeModelStore.shared).
- Ask: AskScreen takes an optional store (MacAskView passes it); restores the draft on open, saves on every change. The chat model empties the draft when sending starts and puts it back on failure, so the store follows that automatically.
- Writing check: draft keyed by subject; restored at model creation; cleared when a check succeeds (failed check keeps it).
- Ingest: the Mac screen that uses IngestScreenModel is MacQuickPracticeView, so it got a one-line wiring and a change hook. The draft is keyed by question variant, restored after load, cleared on successful grading and on Next.
- Decide: MacDecideStore already keeps the model alive across switches, so drafts already survived; only a length bound was added.
- iOS unchanged: store parameters default to nil.

## Defaults taken
- Ingest hook placed in MacQuickPracticeView (not in the owned list) because IngestScreen itself is iOS-only.
- Writing-check text stays visible after a successful check (existing behavior); only the stored draft is cleared, so coming back later shows an empty field.
- Not done (needs root hook): clearing drafts on server change; keys include the server address instead, so drafts never cross servers.

## Checks
- xcodegen run on a copy in /private/tmp/ex6 (worked), derived data /private/tmp/dd-f2.
- PostAnkiMac build: succeeded. PostAnkiIOS (simulator) build: succeeded.
- Mac scheme tests: succeeded, including the 4 new UnsentDraftSmokeTests. Copy included siblings' in-progress edits and still built.
- Repo-wide lint/vitest/tsc do not apply (Swift project, no such tooling).

END-OF-REPORT
