No confirmed scenarios, built from the brief. Written by hand: the wrap-up helper returned no dispatch target for this light run.

Covers: access token in the Keychain with the bearer header, the settings screen, the offline question cache fixes. Nothing here was exercised against live data (prod API not deployed, TLS handshake fails); only the simulator build was checked.

## Environment
- Open PostAnkiIOS.xcodeproj in Xcode (run `xcodegen generate` first if it is missing) and run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally. Set `API_SHARED_SECRET` (or create a personal access token) so the server demands a bearer token.

## Settings and token
1. Home: tap the gear. Expect a server address field, a token field and "No token saved".
2. Without a token, open Study now. Expect the load to fail with the "couldn't load" message (server returns 401), and any queued offline answers to stay queued.
3. In Settings enter the local server address (for example http://localhost:3000) and the token, tap Save. Expect "Saved." and "Token saved"; the token is never shown back.
4. Retry Study now. Expect questions to load.
5. Enter addresses with a trailing slash, a path (https://host/api), a query or an unknown scheme. Expect the slash to be dropped silently and the others to be rejected with the address message, nothing saved.
6. Tap Remove token. Expect "No token saved" and 401s again. An empty token field with Save leaves the stored token unchanged.

## Offline question cache
7. Open Study now online, answer one question, tap Discuss this, go back. Expect the same question, feedback and typed answer, with no reload.
8. Double tap Next quickly. Expect exactly one question advance. Double tap Submit. Expect one grading request in the API logs.
9. Turn on airplane mode, leave the exercise screen and open it again for a topic you already loaded. Expect an "Offline — showing saved questions" banner with the saved questions.
10. For a topic never loaded, go offline and open it. Expect "You're offline and no saved questions are available." with a Try again button that works once online.
11. Open the exercise screen and leave it immediately. Expect no Offline banner and no stuck spinner on return.

## Data gap check
- Nothing here was run against a real server or a real iPhone; Keychain behaviour on a device is unverified.
- The last small fix pass on the exercise screen was not re-reviewed; steps 7 to 11 are the check.
