---
type: scenarios
branch: mobile-token-security
task: "Secure token storage and session persistence on mobile (#67)"
state: confirmed
updated: 2026-07-31
---
# Scenarios: Secure token storage and session persistence on mobile (#67)

## Business Scenarios

SCENARIO 1: First-time pairing shows the plain Connect screen

A user who has never paired the app (no token stored — a fresh install, or one that manually
cleared its own storage) opens `/connect` and sees the existing, unchanged copy: "Connect to Post
Anki" / "Paste the personal access token you minted on your own machine." No "session expired"
or eviction-style wording appears, since nothing was ever evicted.

What to verify:
- `consumeClearReason()` returns `null` on this path (no prior `clearStoredToken("revoked")` call
  happened, so the module-level reason was never set).
- The screen's existing token-paste, verify, and error-on-rejected-paste behavior is unchanged.

SCENARIO 2: A revoked token evicts the user with a clear, distinct message

A user has a previously-paired, now-revoked token stored. The next API call any screen makes
(e.g. `GET /daily-push` on the Today screen, or any call under `/practice`) gets a 401 from
`apps/api`. The app clears the stored token, navigates to `/connect`, and — unlike SCENARIO 1 —
shows a distinct message telling the user their session ended and they need to reconnect, not the
plain first-pairing copy.

What to verify:
- `apiFetch`'s 401 branch calls `clearStoredToken("revoked")` (not the bare `clearStoredToken()`),
  so the eviction reason is recorded before either redirect path fires.
- The Connect screen visibly renders different copy in this case than in SCENARIO 1 — a real,
  visible difference, not just an internal flag.
- The reason is captured correctly regardless of which of the two independent redirect paths
  reaches `/connect` first (see architecture note in spec.md: `apiFetch`'s own imperative
  `router.replace`, and `_layout.tsx`'s effect-driven `router.replace` triggered by the same
  `clearStoredToken` call's `notify(null)`) — both target the same route, and the reason is read
  once from module state when Connect actually mounts, so which redirect "wins" the race doesn't
  change what the user sees.
- After eviction, the stored token key is actually gone (`getStoredToken()` resolves to `null`,
  matching the localStorage fallback proof available under Playwright).
- Re-pairing successfully with a new valid token (submitting the Connect form) clears the reason
  so a later, unrelated visit to `/connect` doesn't show a stale "session ended" message.

SCENARIO 3: A misconfigured plaintext, non-local API URL is refused rather than silently used —
and refused with a message that correctly names the real problem

`EXPO_PUBLIC_API_BASE_URL` is set to a plaintext `http://` URL pointing at a non-loopback host
(anything other than `localhost`, `127.0.0.1`, `::1`, or the Android-emulator loopback alias
`10.0.2.2`). The app must not silently send the Bearer token to that address in cleartext. Two
independent call sites need this covered, not one: pairing a brand-new token (`verifyToken`, on
the Connect screen) and every already-paired API call (`apiFetch`).

What to verify:
- `assertSecureUrl` throws a descriptive error (not a silent pass-through) for a plaintext,
  non-loopback URL, and accepts the unmodified default (`http://localhost:8030`), the
  Android-emulator loopback alias, and any `https://` URL without throwing.
- Pairing a token while the app is pointed at an insecure URL shows a message that says the
  server address is misconfigured — NOT "That token was rejected. Check it and try again." A
  token-rejection message here would mean the guard's error is being silently swallowed by
  `verifyToken`'s pre-existing `catch { return false }`, exactly the bug an earlier draft of this
  plan had and a review pass caught before implementation (see spec.md Decision 5). This is the
  one case in this scenario set where getting the *wrong but plausible-looking* message is a
  worse outcome than an unstyled crash would be, since it actively misdirects the user (in
  practice, the developer) toward re-checking a token that was never the problem.
- An already-paired app whose configured URL later becomes insecure (a config change, not a
  runtime event under normal use) surfaces the guard's error through the same generic
  non-401-error path every other `apiFetch` failure already uses — no bespoke handling needed
  there, since `apiFetch` has no try/catch of its own and the calling screen's existing catch
  already treats any non-`ApiRequestError` throw as "couldn't reach the server."

## Technical/Architectural Scenarios

None beyond what SCENARIO 2 and 3 already cover — this item has no backend, data model, or
infrastructure changes.
