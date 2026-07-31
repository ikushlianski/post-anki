---
type: spec
branch: mobile-token-security
task: "Secure token storage and session persistence on mobile (#67)"
complexity: medium
state: confirmed
updated: 2026-07-31
---
# Spec: Secure token storage and session persistence on mobile (#67)

### What was actually found (read before implementing — this reframes the item's scope)

The wishlist entry and issue #67 both assume `apps/mobile/src/api/token-storage.ts`'s storage
mechanism "has never been verified as secure" and that a 401 might "fail silently." Neither is
true as of this branch. Reading the current code (not the issue's framing) found:

- `token-storage.ts` already uses `expo-secure-store` (iOS Keychain / Android Keystore) on the
  native path. A `Platform.OS === "web"` branch to `window.localStorage` exists only for the web
  target, added by the just-merged `mobile-study-loop` item to make Playwright verification
  possible (`expo-secure-store`'s web module is an empty stub that otherwise crashes
  react-native-web). Native storage is not plain `AsyncStorage` and was not touched here.
- `apps/mobile/src/api/client.ts`'s `apiFetch` already centralizes 401 handling for every network
  call in the app (confirmed: no other `fetch()` call site besides `verifyToken`, which only runs
  pre-pairing). On 401 it clears the token and redirects to `/connect`; every calling screen
  already deliberately swallows the resulting `ApiRequestError` rather than showing a raw error.
  So today's actual behavior is "silent bounce to Connect," not a crash or a confusing error.

The one real, concrete gap against issue #67's Done-when bar ("a revoked/expired token produces a
**clear** re-pair prompt") is that `/connect` renders identical content on first-ever pairing and
on post-eviction re-pairing — nothing distinguishes "you're new here" from "you got logged out."
This spec closes that gap, plus one adjacent transport-security gap found while auditing "secure
token storage" end to end (SCENARIO 3): nothing today stops the app from being pointed at a
plaintext, non-local API URL, which would send the Bearer token in the clear.

The backend's token model (`apps/api/src/db/schema.ts`'s `api_tokens` table,
`apps/api/src/api-token/api-token.repo.ts`) has only a `revokedAt` field — there is no separate
`expiresAt`/TTL concept. Issue #67's "revoked/expired" wording maps to exactly one real mechanism
(revocation); scenarios and the eviction-reason value below are named accordingly (`"revoked"`,
not `"revoked" | "expired"`).

### What to do

1. `token-storage.ts` gains a module-level, read-once "why was the token cleared" mechanism, so
   the Connect screen can distinguish first-time pairing from post-eviction re-pairing without
   relying on route params (see "Decisions made autonomously" #1 for why route params are unsafe
   here).
2. `client.ts`'s 401 branch passes `"revoked"` as that reason when it clears the token. The
   separate "no token stored" 401 path (thrown when `apiFetch` is called with nothing in storage
   at all) does not call `clearStoredToken` and so never sets a reason — this is what keeps
   SCENARIO 1 and SCENARIO 2 visually distinct with no extra flag-threading.
3. `connect.tsx` reads the reason once on mount and renders a visibly different subtitle when it
   is `"revoked"`.
4. `client.ts` gains a transport-security guard, `assertSecureUrl(url)`: refuse (throw, don't
   silently proceed) a plaintext `http://` URL unless the host is a recognized loopback address
   used for local development. Called explicitly at the top of both `apiFetch` and `verifyToken`
   — **not** folded into `apiBaseUrl()` itself, and specifically called *outside* `verifyToken`'s
   existing `try/catch` (see Decision 5, rewritten below — an earlier draft of this guard had a
   real bug here, caught by a second review pass before implementation).

No backend, database, or infrastructure changes. No new screens, dependencies, or navigation
patterns.

### Derivers

No new pure-computation deriver. The two candidate pieces of logic are:
- the loopback-host check in `assertSecureUrl` — a small, total, synchronous predicate over a
  fixed allowlist, kept in the same file (`client.ts`) as its two call sites (`apiFetch` and
  `verifyToken`), mirroring this codebase's existing precedent of not extracting a small predicate
  into a separate layer purely because it has more than one caller within the same file (see
  `mobile-study-loop/spec.md`'s identical reasoning for `apps/mobile`, which has no test runner
  configured at all — confirmed still true, no vitest/jest, no test script in
  `apps/mobile/package.json`);
- the reason get/set pair in `token-storage.ts` — module-level state, not a computation, so it
  isn't deriver-shaped at all.

Both are proven correct by the Playwright DoD mechanism (SCENARIO 2, SCENARIO 3), not a unit test
layer this package doesn't have.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 | None | `apps/mobile/app/connect.tsx` (existing behavior, proven not to regress) | None |
| SCENARIO 2 | None | `apps/mobile/src/api/token-storage.ts`, `apps/mobile/src/api/client.ts`, `apps/mobile/app/connect.tsx` | None |
| SCENARIO 3 | None | `apps/mobile/src/api/client.ts`, `apps/mobile/app/connect.tsx` | None |

### Files to create

No new files.

### Files to modify

```
apps/mobile/
  src/api/
    token-storage.ts   [edit] add a ClearReason type ("revoked"), a module-level
                        lastClearReason variable, clearStoredToken(reason?: ClearReason) — sets
                        lastClearReason before the existing platform-branch delete + notify(null),
                        unchanged otherwise — and a new exported consumeClearReason(): reads and
                        resets lastClearReason to null (read-once semantics). Native SecureStore
                        calls and the web localStorage fallback are otherwise byte-for-byte
                        unchanged.
    client.ts           [edit] (a) the 401 "token rejected" branch calls
                        clearStoredToken("revoked") instead of clearStoredToken(); the "no token
                        stored" branch is unchanged (still no clearStoredToken call, so no reason
                        is ever set on that path). (b) new standalone assertSecureUrl(url) —
                        throws a descriptive Error for any http:// URL whose host isn't in a fixed
                        loopback allowlist (localhost, 127.0.0.1, ::1, 10.0.2.2 — the Android
                        emulator's alias for the host machine's loopback); any https:// URL passes
                        unchanged. apiBaseUrl() itself is NOT changed — it keeps returning a plain
                        string exactly as today, so verifyToken's existing computation of the URL
                        doesn't change shape. (c) apiFetch calls assertSecureUrl(apiBaseUrl()) as
                        its first line — apiFetch has no try/catch of its own today, so a thrown
                        guard error propagates unchanged to the calling screen, same as any other
                        thrown Error (see Decision 5). (d) verifyToken calls
                        assertSecureUrl(apiBaseUrl()) as its first line, BEFORE its existing
                        try/catch block — not inside it — so a thrown guard error is never
                        swallowed by the existing `catch { return false }` and instead propagates
                        out of verifyToken to its caller (connect.tsx).
  app/
    connect.tsx          [edit] (a) reads consumeClearReason() once via a lazy useState
                        initializer on mount, and renders a distinct subtitle when the result is
                        "revoked" ("Your session ended — reconnect with a new token below.")
                        instead of the existing default copy. (b) connect()'s body — currently no
                        try/catch around its `await verifyToken(...)` call at all — gains one,
                        specifically to catch the new case where verifyToken now throws instead of
                        returning false (the assertSecureUrl guard). On catch, sets a distinct
                        error message ("Can't reach the server — check the app's configured server
                        address.") instead of the existing "That token was rejected" message,
                        which stays reserved for verifyToken genuinely resolving to false. The new
                        try/catch uses `finally { setBusy(false) }` so the Connect button
                        reliably re-enables after a guard error, same as it already does today
                        after a normal rejection — the existing empty-input early return keeps its
                        current standalone `setBusy(false)`, unchanged. Existing empty-input
                        validation and the true-rejection path are otherwise unchanged.
```

### Data model changes

Not applicable — no backend or schema changes.

### Documentation changes

`docs/architecture/mobile-study-review-app.md` already documents this app's auth model, including
a Mermaid sequence diagram with the line "If token revoked/unknown: 401 → Mobile clears token,
returns to Connect." Update in place (merged into the existing "Authentication" section, not
appended as a changelog entry):
- Note that the Connect screen now visibly distinguishes first-time pairing from post-eviction
  re-pairing, and name the mechanism (module-level reason state in `token-storage.ts`, read once
  on mount — not a route param, because two independent code paths can both navigate to
  `/connect` after an eviction; see this spec's Decision 1).
- Note the new `assertSecureUrl` transport guard (called from both `apiFetch` and `verifyToken`,
  deliberately not folded into `apiBaseUrl()` itself — see spec.md Decision 5) and why it exists:
  a Bearer PAT sent over plaintext HTTP to a non-local host is not secure storage's problem alone
  — the token also has to travel securely once read from the Keychain/Keystore.
- Close out the now-resolved framing gap: earlier text status quo already correctly says tokens
  are "stored only in the device's secure keychain... never in plain AsyncStorage" — no change
  needed there, this item's audit reconfirmed it rather than finding it wrong.

### Decisions made autonomously

This item was planned unattended, with this session's standing autonomous-confirmation
authorization. Every call below used the safest, most reversible, pattern-following default;
documented here so none needs relitigating.

1. **Carry the eviction reason as module state in `token-storage.ts`, not a route param —
   RESOLVED: module state.** Two independent code paths can both navigate to `/connect` after an
   eviction: `apiFetch` calls `router.replace("/connect")` imperatively right after clearing the
   token, and separately `clearStoredToken()`'s `notify(null)` triggers `_layout.tsx`'s own
   subscriber, which sets `hasToken = false` and — in its own `useEffect` — also calls
   `router.replace("/connect")`, with no params. A reason threaded through route params would risk
   being silently dropped by whichever of the two paramless-vs.-with-params replace calls actually
   lands, depending on effect-ordering timing that isn't worth depending on. Module state read
   once, synchronously, when Connect mounts sidesteps the race entirely: by the time either
   redirect fires, `clearStoredToken("revoked")` has already set the reason, and it doesn't matter
   which redirect call "wins" — Connect reads the same module variable either way.

2. **Do not add a proactive token-validity probe on cold start — RESOLVED: keep presence-only
   gating in `_layout.tsx`.** Tempting alternative: call `verifyToken()` on cold start so a
   revoked token is caught before any screen renders, not after its first API call. Rejected:
   `verifyToken` returns `false` on *any* fetch failure (`catch { return false }`), not just a
   genuine 401 — gating cold start on it would evict a perfectly valid token every time the app
   opens with no network reachable yet, a real regression for normal offline-then-reconnect usage.
   Every screen already calls `apiFetch` on mount, so a revoked token is still caught within one
   request of cold start; only the *messaging* needed fixing, which SCENARIO 2 does directly.

3. **`assertSecureUrl`'s loopback allowlist is a fixed, small set, not a general private-IP range
   check — RESOLVED: `localhost`, `127.0.0.1`, `::1`, `10.0.2.2` only.** A broader check (e.g. all
   of `10.0.0.0/8`, `192.168.0.0/16`) would also silently accept a real LAN deployment over
   plaintext HTTP, which is exactly the case this guard exists to catch — home/office Wi-Fi is not
   inherently trusted the way a loopback address is. The four listed hosts cover every local-dev
   configuration this app actually uses today (default `localhost:8030`, and the Android
   emulator's well-known loopback alias); anything beyond that must be `https://`.

4. **No token rotation, refresh, or biometric gate added — RESOLVED: out of scope, not an
   oversight.** `apps/api`'s token model has no refresh/rotation endpoint at all (tokens are
   minted once via a local script and either stay active or get revoked); adding a client-side
   refresh flow with no server-side counterpart would be dead code. A biometric/passcode gate in
   front of the already-Keychain/Keystore-backed token is a genuinely separate feature with its
   own UX questions (what happens with no biometrics enrolled, fallback PIN, etc.) that neither
   the wishlist entry nor issue #67 asked for — not silently added here.

5. **`assertSecureUrl` must NOT live inside `apiBaseUrl()` — RESOLVED: called explicitly at each
   of the two real call sites instead, and never inside `verifyToken`'s existing try/catch.** An
   earlier draft of this spec put the guard inside `apiBaseUrl()`, reasoning that every caller
   derives its URL from that one function. That was a real bug, caught by a second review pass
   before implementation: `verifyToken` (used only pre-pairing, on the Connect screen) wraps its
   entire body in `try { ... } catch { return false }` — if `apiBaseUrl()` threw from inside that
   try block, the throw would be silently swallowed and reported as `false`, and Connect would
   show "That token was rejected. Check it and try again." for what is actually a server
   misconfiguration, not a bad token. That is precisely the "confusing error" class issue #67
   asks this item to eliminate — introduced by the fix meant to close a different gap. Fixed by
   keeping `apiBaseUrl()` unchanged and calling `assertSecureUrl(apiBaseUrl())` explicitly at the
   top of both `apiFetch` (which has no try/catch of its own, so the throw propagates normally to
   the calling screen's existing catch block — its outcome is per SCENARIO 2 above, no new UI
   needed there) and `verifyToken`, in `verifyToken`'s case placed *before* its try block so the
   throw is never caught by `catch { return false }` and instead propagates to `connect.tsx`.

6. **`connect.tsx`'s `connect()` gains a try/catch it didn't have before — RESOLVED: needed to
   correctly surface Decision 5's propagated throw.** Once `verifyToken` can throw (rather than
   only ever resolving to `true`/`false`), `connect()`'s `await verifyToken(trimmed)` call needed
   a catch — without one, a thrown guard error becomes an unhandled promise rejection in a React
   event handler, which is worse than the bug this item exists to fix (a hard, unlabeled failure
   instead of a clear message). The catch sets a config-specific message ("Can't reach the server
   — check the app's configured server address."), kept visibly distinct from the existing "That
   token was rejected" message so a user (realistically, only the developer/self, since this is a
   single-user app) can tell a bad token apart from a bad server address. This is the one small
   piece of "bespoke UI path" a plain generic-error approach could not avoid, once Decision 5
   required the guard to actually reach the surface that triggered it rather than being silently
   reinterpreted as something else.

### Implementation order

1. `apps/mobile/src/api/token-storage.ts` — add `ClearReason`, `lastClearReason`,
   `clearStoredToken(reason?)`, `consumeClearReason()`. No behavior change to native/web storage
   itself.
2. `apps/mobile/src/api/client.ts` — pass `"revoked"` on the 401-rejected path; add
   `assertSecureUrl`/`apiBaseUrl()` guard.
3. `apps/mobile/app/connect.tsx` — read the reason once on mount, render the distinct subtitle.
4. `npx tsc --noEmit` in `apps/mobile` — must be clean.
5. Standalone Playwright script (see Definition of Done below) proving SCENARIO 1–3 under
   `expo start --web`.
6. Update `docs/architecture/mobile-study-review-app.md` per "Documentation changes" above.

### Scope boundary

Out of scope, all confirmed deliberate:
- Native SecureStore/Keychain/Keystore behavior itself — already correct, already shipped by
  `mobile-study-loop`; this item audits and confirms it, does not change it.
- Real device/restart/app-update persistence proof — deferred to issue #65 (on-device human
  verification), same deferral this repo's mobile items already establish.
- A proactive cold-start validity probe (Decision 2).
- Token rotation/refresh, biometric/passcode gate in front of the stored token (Decision 4).
- Any change to `_layout.tsx`'s navigation-gating logic beyond what already exists — it continues
  to gate purely on token presence.
- Any backend change — the token model, revocation mechanism, and auth middleware are untouched.

### Definition of Done — per layer

**Backend: not applicable, confirmed (not assumed).** No file under `apps/api` is touched by this
spec. `apps/api/src/api-token/api-token.repo.ts`'s `isTokenActive`/`findActiveTokenByHash` and the
global `authorized()` middleware are read this session to confirm the "revoked, not expired"
token model claim above — not modified.

**Mobile/frontend — the same proven mechanism `mobile-study-loop` established, reused exactly:**

A standalone Playwright script, written directly against the `playwright` npm package (already at
the repo root), run via plain `node` — never `npx playwright test`, never any
`mcp__chrome-devtools__*` tool, and not part of `verification-repo` (no entry exists there for
`apps/mobile`) — driving `npx expo start --web` (react-native-web; the `"web"` script already
exists in `apps/mobile/package.json`). `page.route()` mocks every network call, because
`apps/api/src/server.ts` sends no CORS headers on any response, so a live cross-origin fetch from
the Metro web dev server would be blocked by the browser's own preflight check regardless of what
the mocked-vs-real question would otherwise resolve.

**What this plan proves itself, in this environment:**
- SCENARIO 1: fresh `localStorage` (no token key seeded) → navigating to `/connect` renders the
  existing default copy, no eviction wording.
- SCENARIO 2: a token seeded into `localStorage` → `page.route()` returns 401 for the next
  `apiFetch` call (e.g. `GET /daily-push`) → assert the app navigates to `/connect`, renders the
  distinct "session ended" copy (not SCENARIO 1's copy), and that the token key is actually gone
  from `localStorage` afterward.
- SCENARIO 3: exercised through the real running app, not a function imported in isolation — the
  same mechanism as SCENARIO 1/2, not a second one. Start a second, separate `expo start --web`
  process with `EXPO_PUBLIC_API_BASE_URL` set to a plaintext, non-loopback value (e.g.
  `http://example.com`), point a Playwright page at it, attempt to pair a token through the real
  Connect screen, and assert the distinct "Can't reach the server — check the app's configured
  server address." message renders (Decision 6) — never the "token was rejected" message, since
  that would mean Decision 5's fix regressed. Also assert the token was never written to storage
  (`getStoredToken()` still resolves to `null` after the attempt) — `setStoredToken` is only ever
  reached after `verifyToken` resolves `true`, so this should hold structurally, but asserting it
  directly is what makes this a proof rather than a reading of the control flow. This scenario
  also directly re-proves the exact propagation
  path (`assertSecureUrl` → `verifyToken` throws → `connect()`'s new catch) that the bug in
  Decision 5 was found in, which a function-in-isolation test would not have caught. The
  SCENARIO 1/2 process (default/unset `EXPO_PUBLIC_API_BASE_URL`, i.e. `http://localhost:8030`)
  is a separate, unmodified process — SCENARIO 3 is never proven by mutating the base URL
  mid-run of the process SCENARIO 1/2 depend on, since every `apiFetch` call in that same process
  would then start throwing too.
- `npx tsc --noEmit` clean in `apps/mobile`.

**What this explicitly does NOT prove, and why — stated so it isn't overclaimed:**
`expo-secure-store` has no web implementation, so every part of this Playwright proof that touches
token storage necessarily exercises the `Platform.OS === "web"` → `localStorage` fallback path
added by `mobile-study-loop`, not real native SecureStore/Keychain/Keystore behavior. This proof
demonstrates the eviction-reason mechanism and the transport guard work correctly against that
fallback; it does not and cannot demonstrate real device Keychain/Keystore storage, real
app-restart persistence, real app-update persistence, or real native network/TLS behavior on a
physical phone. Those all stay deferred to issue #65 (on-device human verification with a
physical device and Expo Go), exactly the same deferral `mobile-study-loop`'s own spec.md already
established for this codebase. What can be shown here for the native branch is that the code
*selects* `SecureStore.*` calls on non-web platforms (by reading the unchanged native branch and a
clean `tsc --noEmit`) — not that those calls *work* on a real device.
