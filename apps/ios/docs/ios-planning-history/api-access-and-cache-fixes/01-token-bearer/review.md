# Review: 01-token-bearer

Mode A (plan folder is the contract: spec.md, handoff.md, brief.md). Complexity as dispatched: complex. One pass, one reviewer, no sub-agents. Build was not rerun (already passing per the implementation report). Runtime Keychain behavior and live API behavior were not exercised by anyone.

## Verdict: APPROVED

Counts: Critical 0, High 0, Medium 0, Low 6.

## What was checked, with evidence

Facts (each read directly from the diff or the files named):

- Token never reaches logs, UserDefaults or source. A grep of `Sources` for `print(`, `NSLog`, `Logger`, `os_log`, `dump(` finds none. The only `UserDefaults` use is the pre-existing `apiBaseURL` and `LastStudied` keys. `TokenStoreError` carries only an `OSStatus` (`Sources/PostAnkiIOS/API/TokenStore.swift:4-6`). `APIError` has no token field. The token is interpolated in exactly one place (`Sources/PostAnkiIOS/API/APIClient.swift:39`). `Local.xcconfig` is gitignored and holds only signing settings.
- Keychain attributes match the spec: generic password, service `com.ikushlianski.postankiios.api`, account `access-token`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` set on add (`TokenStore.swift:64`), `kSecAttrSynchronizable` false in the shared query (`TokenStore.swift:16`) so read, update and delete only touch the local item. No access-control flags, so a per-request read cannot prompt. Update-then-add ordering keeps the old token if the write fails and avoids duplicate-item errors.
- Read fails closed: any non-success status or non-UTF-8 data returns nil (`TokenStore.swift:26-32`), so no header is attached and nothing crashes. `save` trims, treats empty as clear, rejects anything outside 0x21-0x7E, and throws only `errSecParam` or the Keychain status. `clear` treats not-found as success.
- Header is on every path. All eleven `APIClient` static functions call the single `request` builder (`APIClient.swift:25-59`); `PendingAnswerQueue.flush` calls `APIClient.gradeAnswer` (`PendingAnswerQueue.swift:38`), so replays carry the token. No other `URLSession` or `URLRequest` use exists in `Sources`. The guard (`APIClient.swift:21-23`) is exact-match `localhost` / `127.0.0.1` or scheme `https` (lowercased). Host-spoofing forms such as `http://127.0.0.1.evil.com` or userinfo tricks do not pass an exact host match. The project sets no App Transport Security exceptions, so cleartext to a remote host is blocked a second time by the OS.
- 401 does not destroy queued answers. `APIError.unauthorized` is thrown before the generic non-2xx branch (`APIClient.swift:49-51`), and the queue returns on it before the bare `catch` that deletes (`PendingAnswerQueue.swift:54-55`). The flush stops at the first 401, so no loop over the queue. Spot-checked the server claim: `post-anki/apps/api/src/api-server.ts` returns `401 unauthorized` from `authorized()` and the only 403 in that file is the CORS origin check, which a native client does not trigger.
- Swift 6: `TokenStore` is a stateless enum with `let` string constants and computed dictionaries; `TokenStoreError` is `Sendable`; Keychain calls are thread-safe; no shared mutable state was added. No default-actor-isolation setting exists in `project.yml` or `Config/Base.xcconfig`, so `APIClient.request` and `TokenStore.read` are nonisolated and compile cleanly (build reported passing).
- Scope: four files, matching the spec's file list. The settings UI is not required or added. The `APIClient` comment edit and README line are the two doc changes the spec asked for.

Assumptions / not verified:

- Keychain read, save and clear were never run (no UI, no test target). Correctness of those calls rests on code reading and the passing build.
- Whether Foundation strips `Authorization` on a cross-host redirect is an unverified platform assumption carried over from the spec.

## Findings

### Critical
None.

### High
None.

### Medium
None.

### Low

1. Saved token keeps old accessibility class if the item already exists.
   - Symptom: none today; a token saved under a weaker accessibility class (for example by an earlier build or a restored item) would stay readable under that weaker class after the user re-saves.
   - Mechanism: the update path (`TokenStore.swift:51-54`) changes only `kSecValueData`; `kSecAttrAccessible` is set only on `SecItemAdd`.
   - Fix: include `kSecAttrAccessible` in the update attributes dictionary, or delete and add.

2. A dev base URL like `http://LOCALHOST:3000` or `http://[::1]:3000` silently gets no token.
   - Symptom: the developer sees "Couldn't ..." errors (401) against a local server with a valid token stored, with no hint why.
   - Mechanism: `canSendToken` compares `url.host` case-sensitively and does not recognise IPv6 loopback (`APIClient.swift:22`). It fails safe (no token sent), so this is a usability gap, not a leak.
   - Fix: compare `url.host?.lowercased()` and add `::1`; optional, since the settings item may constrain the address field anyway.

3. A Keychain read error looks identical to "no token stored".
   - Symptom: if the Keychain is briefly unavailable (for example `errSecInteractionNotAllowed` on a background launch before first unlock), the request goes out unauthenticated and the user just sees a generic "Couldn't ..." message, or a queued-answer replay is skipped until the next flush.
   - Mechanism: `read()` collapses every non-success status into nil (`TokenStore.swift:26-28`), as the spec chose; also the stored string is not re-validated for header-safe characters on read, relying on `save` being the only writer.
   - Fix: accepted by spec and safe now; when the settings item lands, consider a `readResult` that distinguishes not-found from error so the UI can say "token unavailable", and apply the same printable-ASCII check on read.

4. The security-critical guard and the save validation have no automated test.
   - Symptom: a future edit that loosens the `https` / loopback check (sending the token over cleartext) would not be caught by anything except the next review.
   - Mechanism: no test target exists (spec decision), and `canSendToken` is `private` with logic that is pure and easy to test.
   - Fix: when a test target is introduced, make `canSendToken` internal and cover https, http remote, localhost, `127.0.0.1`, spoofed hosts; cover `TokenStore.save` rejection of whitespace-inside and non-ASCII tokens.

5. Cross-host or downgrade redirect behavior is assumed, not enforced.
   - Symptom: none today (the API does not redirect); if it ever redirected to another host, the token's fate depends on platform behavior.
   - Mechanism: `URLSession.shared` is used with no task delegate to strip `Authorization` on redirect (`APIClient.swift:46`).
   - Fix: leave as is while the API does not redirect; if redirects appear, use a session with a redirect delegate that drops the header when the host or scheme changes.

6. A live answer that gets a 401 is not saved for retry.
   - Symptom: once the server requires a token and none is stored, an answer typed on the exercise screen shows "Couldn't grade that answer." and is lost, whereas offline answers are queued.
   - Mechanism: `ExerciseScreen` queues only on `URLError` (`Sources/PostAnkiIOS/ExerciseScreen.swift:97-108`); the spec explicitly left this unchanged.
   - Fix: in the settings item, queue the answer on `APIError.unauthorized` too (or prompt for the token first). Out of scope here; recorded so it is not forgotten.

## Architecture review

Planned (brief.md): `APIClient` stays the only request builder and adds the bearer header; a `TokenStore` owns the token in the Keychain via the Security framework with no new dependency; settings screen later.
Built: exactly that, plus the queue change the spec added after finding the silent-delete-on-401 behavior. Infrastructure changes: none. Unplanned changes: none found. Divergences needing input: none.

## Business explainer

When the app has a token stored, every request to the server now proves who the user is, including answers that were saved offline and sent later. If the server says the token is missing or wrong, the app now treats that as its own case, and saved answers are kept instead of being thrown away. Until the settings screen exists there is no way to store a token, so users see no change except that case. Edge cases: a token is never sent to a plain-http address that is not the phone itself; a reinstalled app may still find an old token in the Keychain; a bad token behaves exactly like no token.

END-OF-REPORT
