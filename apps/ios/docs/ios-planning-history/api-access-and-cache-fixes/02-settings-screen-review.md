# 02 Settings screen review

Mode B, one pass. Contract: item text "Add a settings screen from Home to edit the API server address and access token." plus the architecture in brief.md. Diff reviewed: `git diff 466d5d8 -- Sources` (SettingsScreen.swift new, HomeScreen.swift toolbar gear). Build not rerun, per brief; tests and lint not applicable (no test target for this item).

## Verdict: NEEDS-CHANGES

Counts: Critical 0, High 0, Medium 1, Low 4.

The screen does what the item says and the token handling is clean. One Medium: a common address input is accepted, reported as "Saved.", and then breaks every request.

## Does the screen do what the item says
Yes. Home has a gear in the toolbar (HomeScreen.swift:80-89) that pushes SettingsScreen. SettingsScreen.swift edits the address (UserDefaults via `APIClient.baseURLString`, SettingsScreen.swift:35) and the token (Keychain via `TokenStore`, SettingsScreen.swift:25-26). Nothing outside scope in this item's diff.

## Empty-token deviation (brief: empty clears; built: empty leaves unchanged, plus Remove button)
Judgement: it does not hurt the user, and it deviates from the literal brief text only.
- The token is never shown back and the secure field always starts empty (SettingsScreen.swift:7, 38). Under the brief's literal rule, a user who only edits the address and taps Save would silently wipe their token. The built behaviour avoids that.
- The ability to clear is preserved and more discoverable: the "Remove token" button (SettingsScreen.swift:76) calls `TokenStore.clear()`. The "Token saved / No token saved" line (SettingsScreen.swift:68) tells the user the state.
- Contract impact: brief.md line 7 ("An empty token clears it") is not met as written. This is a contract wording gap, not a defect. Fix is to amend the brief sentence to "an empty field leaves the token unchanged; Remove token clears it", not to change the code. Note `TokenStore.save("")` itself still clears (TokenStore.swift:39-42), which matters for the whitespace case in Low 1.

## Token never in logs, UserDefaults or UI
Pass. No print or logging in the new code. The token is only passed to `TokenStore.save` (Keychain). UserDefaults receives only the address. The UI shows a `SecureField` and a "Token saved" label, never the value or a prefix. Error strings are fixed text and do not expose the OSStatus or the token. The field is cleared after a successful save (SettingsScreen.swift:36).

## Address validation and no save on error
Scheme http/https (case-insensitive) and non-empty host are enforced (SettingsScreen.swift:16-21), after trimming. On a validation error the function returns before any token or address write. If the token write fails, it returns before the address write (SettingsScreen.swift:23-30), so a failed token save saves nothing. Pass, except Medium 1.

## Failure paths inline
Validation, token-save and token-remove failures set `errorMessage`, rendered in red in the form (SettingsScreen.swift:84-87). Success shows "Saved." / "Token removed." inline. Pass (see Low 2 for message quality).

## Swift 6 / MainActor
`@Observable @MainActor final class` matches HomeScreenModel. `APIClient.baseURLString` is a computed static, `TokenStore` is nonisolated, both are called from the MainActor with no captured non-Sendable state. No concurrency problems found.

## Home layout and Study now link
Unchanged. The diff only adds a `.toolbar` modifier after `.navigationTitle("Home")` (HomeScreen.swift:80-89). The Study now `NavigationLink` and its `.disabled(model.topics.isEmpty)` (HomeScreen.swift:56-64) are untouched.

## Findings

### Critical
None.

### High
None.

### Medium
1. Symptom: a user pastes an address ending in a slash (for example `https://api.example.com/`) or with a path, query or fragment, sees "Saved.", and then every screen fails to load.
   Mechanism: validation only checks scheme and host (SettingsScreen.swift:16-21) and stores the trimmed string as-is, while `APIClient.request` builds `"\(baseURLString)\(path)"` (APIClient.swift:30), giving `https://host//subjects` or a URL with the query glued to the path.
   Fix: on save, reject addresses that have a query or fragment, strip trailing slashes from the stored value (and show the cleaned value in the field), then run the existing scheme and host check.

### Low
1. Symptom: pasting only spaces into the token field and tapping Save silently deletes the saved token and shows "Saved.".
   Mechanism: the screen only skips the write when `token.isEmpty` (SettingsScreen.swift:24), but `TokenStore.save` trims and treats a whitespace-only value as clear (TokenStore.swift:37-42).
   Fix: test the trimmed value in the model (`token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty`) so whitespace-only is treated like an empty field.
2. Symptom: pasting a token that contains a non-ASCII or hidden character shows "Couldn't save the access token.", which reads like a storage fault.
   Mechanism: `TokenStore.save` throws `errSecParam` for characters outside printable ASCII (TokenStore.swift:44-46) and the model maps every error to one message (SettingsScreen.swift:28).
   Fix: when the thrown status is `errSecParam`, show "The token has characters that are not allowed. Paste it again." and keep the generic text for other statuses.
3. Symptom: a user who enters an `http://` address for a non-local host sees "Saved.", but requests are blocked or sent without the token, with no explanation.
   Mechanism: validation allows any http host (as the item requires), while `APIClient.canSendToken` only sends the token over https or localhost/127.0.0.1 (APIClient.swift:21-23), and the default App Transport Security policy blocks plain http.
   Fix: keep accepting http, but show an inline note on save when the scheme is http and the host is not localhost/127.0.0.1 ("The access token is only sent over https or to localhost.").
4. Symptom: tapping "Remove token" deletes the token immediately, with no confirmation, next to the Save button.
   Mechanism: the destructive button calls `removeToken()` directly (SettingsScreen.swift:76).
   Fix: add a confirmation dialog, or accept as-is since the token is re-pasteable; minor.

## Not verified
Keychain read/write and live server behaviour at runtime (per implementer report and brief). Build result taken from the implementer report.

END-OF-REPORT
