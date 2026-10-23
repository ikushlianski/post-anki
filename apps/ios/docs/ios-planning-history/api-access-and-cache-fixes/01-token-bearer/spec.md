---
type: spec
branch: main
task: Keep an access token in secure storage and send it as a bearer header on every request
complexity: simple
state: confirmed
updated: 2026-10-17
---
# Spec: Token in Keychain, bearer header on every request

### The ask
"Keep an access token in secure storage and send it as a bearer header on every request."
Architecture is fixed by `.planning/api-access-and-cache-fixes/brief.md`. The settings screen is a separate later item and is not planned here.

### What to do
Add a small `TokenStore` that keeps one access token in the iOS Keychain (read, save, clear). `APIClient.request` reads it on every call and, when present and the destination is safe, adds `Authorization: Bearer <token>`. A 401 from the server becomes a distinct `APIError.unauthorized`. `PendingAnswerQueue` must keep queued answers on `unauthorized` instead of discarding them.

Facts (verified in code):
- Server: `post-anki/apps/api/src/api-server.ts:313-345` accepts `Authorization: Bearer <API_SHARED_SECRET>` or `Bearer <personal access token>`; if `API_SHARED_SECRET` is unset every request passes. Rejection is `401` with body `{"error":"unauthorized"}` (`api-server.ts:406-408`). No 403 is produced by this check.
- `APIClient.request` (`Sources/PostAnkiIOS/API/APIClient.swift:21-47`) is the only request builder; it maps any non-2xx to `APIError.badStatus(status, code)`.
- `PendingAnswerQueue.flush` (`Sources/PostAnkiIOS/PendingAnswerQueue.swift:28-59`): `URLError`, cancellation and `badStatus >= 500` stop the replay and keep answers; every other error falls into the final bare `catch` and deletes the answer. Today a 401 is therefore a silent permanent loss of the user's queued answers. Once the server requires a token this fires whenever the token is missing, wrong or revoked. This is why the queue needs a change.
- `ExerciseScreen.submitAnswer` (`ExerciseScreen.swift:97-110`) queues only on `URLError`; a 401 on a live submit shows "Couldn't grade that answer." and queues nothing. No change needed there.

#### TokenStore design (new, `Sources/PostAnkiIOS/API/TokenStore.swift`)
- `enum TokenStore` (no state, nothing to isolate under Swift 6). Surface: `static func read() -> String?`, `static func save(_ token: String) throws`, `static func clear() throws`. Error type: `TokenStoreError` carrying the `OSStatus`, `Error` and `Sendable`. Never carries the token.
- Keychain item: `kSecClassGenericPassword`, `kSecAttrService` = `"com.ikushlianski.postankiios.api"`, `kSecAttrAccount` = `"access-token"`, value in `kSecValueData` (UTF-8). Service/account are private constants in the file.
- Accessibility: `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. Readable while the device is locked after first unlock (a later background replay of the answer queue works), excluded from backups and device migration, never synced. `kSecAttrSynchronizable` stays false. No access-control flags or biometrics (a read per request must never prompt).
- `save`: trim whitespace and newlines; empty after trimming means `clear()`; reject (throw) a token with any non-printable-ASCII character, because the value goes into an HTTP header. Write via `SecItemUpdate`, falling back to `SecItemAdd` on `errSecItemNotFound` (so there is never a duplicate-item error and the old token is kept if the write fails).
- `clear`: `SecItemDelete`; `errSecItemNotFound` is success.
- `read`: `SecItemCopyMatching` with `kSecReturnData` and `kSecMatchLimitOne`. `errSecItemNotFound` returns nil. Any other status, or data that is not valid UTF-8, also returns nil (fail closed). No caching: read every request so a clear or save takes effect on the next call.
- No `print`, no `os.Logger`, no error text that includes the token. Nothing is written to UserDefaults.

#### APIClient changes (`Sources/PostAnkiIOS/API/APIClient.swift`)
- In `request`, after building `req`: if `TokenStore.read()` returns a token and `url` is eligible, `req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")`. Eligible means scheme `https`, or host `localhost` / `127.0.0.1` (local dev). Otherwise no header is attached, so a bearer token is never sent in cleartext to a remote host if the base URL is mistyped as `http://`.
- After the status check, `401` throws `APIError.unauthorized`; other non-2xx stay `badStatus`. Add `case unauthorized` to `APIError`.
- Replace the stale comment above `enum APIClient` ("No authentication, matching the app's spec...") with two lines saying requests carry a bearer access token from the Keychain (`TokenStore`) when one is stored, and that the base URL is configurable.
- No other call site changes; every `static func` already goes through `request`.

#### PendingAnswerQueue change (`Sources/PostAnkiIOS/PendingAnswerQueue.swift`)
- Add `catch APIError.unauthorized { return }` before the final bare `catch`. Answers stay on disk and replay on a later flush once the token is fixed. One extra retry per flush trigger is the only cost (flush stops at the first 401, so no loop over the whole queue).

#### Doc change
- `README.md` line 3: "No authentication" becomes a statement that the app authenticates with a bearer access token kept in the Keychain.

### Failure behavior (resilience and security pass)
- Keychain read fails or returns garbage: no header, request goes out unauthenticated, server answers 401 (or 200 if the server has no secret). The app never crashes and never blocks on Keychain errors.
- Keychain save/clear fails: thrown to the caller (the future settings screen shows it). Old value stays on a failed update.
- No token stored: no header. Correct when the server has no secret configured.
- 401: `APIError.unauthorized`. Existing screens fall into their generic "Couldn't ..." message (no UI change in this item). Queued answers are kept.
- Wrong/revoked token behaves exactly like a missing one.
- Token exposure surfaces: not in UserDefaults, source, logs, plan files, or the project; `APIError` and `TokenStoreError` never contain it. `URLSession.shared` default cache stores responses, not request headers.
- Assumption: Foundation drops `Authorization` on a cross-host redirect; the API does not redirect today and nothing here relies on that.
- Keychain items survive app deletion on iOS, so a reinstalled app may still hold an old token. The later settings screen must offer clear.
- Cost: one local Keychain read per request, no network, no tokens/LLM cost. No retry or loop is added.

### Decisions made autonomously
- Distinct `APIError.unauthorized` instead of matching `badStatus(401, _)` at each caller: the queue needs it now and the settings screen can later use it for a "check your token" prompt.
- Queue change added although the item expected none (3 code files, not 2): without it a missing or bad token deletes the user's unsent answers.
- HTTPS-or-loopback guard on the header: cheap, matches App Transport Security intent, no UI.
- No test target added (project has none and adding one is out of scope); TokenStore logic is thin Keychain glue, verified by build and a manual check later with the settings screen.
- `AfterFirstUnlockThisDeviceOnly` over `WhenUnlocked...`: leaves room for background replay; no extra exposure for a personal-use token.

### Files to touch
```
post-anki-ios/
├── Sources/PostAnkiIOS/API/TokenStore.swift       NEW: Keychain read / save / clear
├── Sources/PostAnkiIOS/API/APIClient.swift         bearer header in request, 401 -> unauthorized, APIError.unauthorized, comment fix
├── Sources/PostAnkiIOS/PendingAnswerQueue.swift    keep answers on unauthorized
└── README.md                                       drop "No authentication"
```
New file means run `xcodegen generate` before building (the `.xcodeproj` is generated from `project.yml`, which needs no edit because sources are a folder path).

### Done when
- `xcodegen generate` then `xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' -quiet build CODE_SIGNING_ALLOWED=NO` succeeds with no Swift 6 concurrency errors.
- Reading the diff: every request path goes through the one header-adding spot; the token appears in no `print`/log/UserDefaults/literal; a 401 never deletes a queued answer.
- Live behavior against the real API is NOT verified (prod API not deployed, and there is no UI to store a token yet). Say so in the implementation report.

### Risk & rollout
No server change. Until the settings item lands there is no way to store a token, so behavior is unchanged for users except 401 now surfacing as `unauthorized` and queued answers being kept on 401 instead of deleted. Blast radius is every API call (one shared builder), so a mistake in the header code would break all screens; the build and diff review are the guard.
