# ex12 report

Diff: `git diff --cached` (my files only; .planning/todo files untouched).

## Finding 1: Decide reset and clip note
- MacDecideStore now owns a ServerScopeObserver (new, Sources/Shared/ServerScopeObserver.swift, same settings-saved pattern as UnsentDraftStore) and resets the shared DecideModel when ServerScope changes.
- UnsentDraftStore tracks clipped keys: `wasClipped(for:)`. Ask and Writing check show DraftClippedNote ("Kept first 10,000 characters"); Decide shows it per field (it clips in the view, not via the store).

## Finding 2: reload keeps input
- `UnsentDraftStore.hasAny` added; MacUnsentInput.hasAny = reported sources || store.hasAny || focused text view.
- Sources live in Shared `UnsentInputSources` (Shared is compiled into the smoke-test target, which lacks Mac code); MacUnsentInput.set delegates to it.
- `.reportsUnsentInput(source, hasInput)` modifier added to: Ask (turns, in-flight send, draft), Writing check, Quick practice, course-create form, Add-knowledge dictation, Decide. Each clears on disappear.

## Finding 3: token removal
- API: `UnsentDraftStore.shared.reset()` (already existed; now also clears clipped flags). Sibling calls it in removeToken. Tested.

## Checks
- Mac scheme tests: passed (169 + 36). iOS scheme build: succeeded. Built from a private xcodegen copy at /private/tmp/h2spec, derivedData /private/tmp/dd-h2.
- No lint tool in repo (no CLAUDE.md / swiftlint config found); not run. Tests: Tests/PostAnkiMacSmokeTests/UnsentInputSmokeTests.swift.

## Defaults and caveats
- An in-flight Decide submit started on the old server can still set a session after the reset; not guarded.
- AskScreen's draft key is fixed at init, so a screen already open keeps the old-scope key until re-created.
- Decide session being displayed (no typed input) does not block reload.
- Not a Mac-only hasInput: modifier runs on iOS too, harmlessly.

END-OF-REPORT
