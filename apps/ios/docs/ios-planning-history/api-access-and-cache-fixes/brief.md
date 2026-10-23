## Goal
The app can talk to the real post-anki API with a personal access token, the user can set the server address and token in the app, and the offline question cache behaves.

## Architecture
- `APIClient` stays the only place that builds requests. When a token is stored it adds `Authorization: Bearer <token>` to every request. The server accepts a shared secret or a personal access token in that header (post-anki `apps/api/src/api-server.ts:320-331`). `PendingAnswerQueue` already goes through `APIClient`, so replayed answers carry the token too.
- A new `TokenStore` module owns the token. It stores it in the iOS Keychain with the Security framework, no new dependency. It exposes read, save and clear. The token is never written to UserDefaults, logs or the project.
- A new settings screen, opened from Home, edits the API server address (the existing `APIClient.baseURLString` UserDefaults value) and the token. The token field is secure and the saved token is never shown back in full. An empty token clears it.
- The offline question cache fixes stay inside `ExerciseScreenModel`: it loads the first topic once per screen instance, a cancelled request (`URLError.cancelled`) is not treated as offline, and `nextBit` ignores a second call while one is running.
- No backend change, no new endpoint, no new dependency.

## Decisions
- Keychain over UserDefaults for the token: it is a credential. Matches how post-anki's Expo client keeps it in secure storage.
- Settings live in a screen opened from Home, not a new tab: the tab bar already has four tabs.
- The `APIClient.swift` header comment that says "No authentication" is updated to match.

## Check
Real `xcodebuild` for the iOS simulator passes. Live data cannot be verified (prod API not deployed); say so.
