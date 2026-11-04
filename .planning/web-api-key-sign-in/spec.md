---
type: spec
branch: learn-from-doc-site
task: web-api-key-sign-in
complexity: complex
state: draft
updated: 2026-10-25
---
# Spec: web sign-in with the app key, email and password, and native sessions

### Summary
The production web app at the public site answers every request with "auth not configured" because it only knows magic-link email sign-in, which needs an email provider key that production does not have. This change lets the single owner sign in three ways: paste the same kind of per-device key the iOS app already uses, type email and password, or (optionally) use a magic link. Every method ends in the same normal Better Auth session, so the rest of the web works unchanged, and native Apple apps can later sign in with email and password and send a session token instead of a device key. Installed apps keep working unchanged throughout.

### The ask
"production web at https://postanki.ilya.online shows 503 auth_not_configured ... keep using Better Auth, but also sign in to the web with the same API key the iOS app uses ... and to receive a Better Auth cookie session from it ... Magic link stays as an optional second method and must not be required (no RESEND_API_KEY needed in production). The web must stop reporting auth as unconfigured when the key method is available and the owner user exists" plus: "also support Better Auth email and password sign-in for the single owner account kushliansky@gmail.com" and "one account ... must work on both the native Apple apps and the web ... the API accepts a Better Auth session from native clients as well as the web cookie ... Installed iOS and Mac apps that still send the existing device token or shared key must keep working unchanged during rollout".

### Facts (from code)
- The 503 comes from the web gate when the API reports "unconfigured": `apps/api/src/auth/auth-status.ts:30-47` returns it when `RESEND_API_KEY` is empty or the users table is empty; `apps/web/src/web-auth/web-auth.access.ts:41-43` turns it into 503 in production.
- The iOS and Mac apps send `Authorization: Bearer <token>` with a token from the Keychain (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift:100-101`). The token is a `pat_...` device token minted by `apps/api/scripts/create-api-token.ts`, stored only as a SHA-256 hash in `api_tokens` (`apps/api/src/api-token/api-token.repo.ts`). The apps do NOT send `API_SHARED_SECRET` (`docs/architecture/mobile-study-review-app.md:13-23`).
- `API_SHARED_SECRET` is the web server's own credential to the API (`.github/workflows/deploy.yml` sets it on both Cloud Run services; `apps/web/src/web-auth/web-auth.proxy.ts:35-40`). It never reaches browsers or apps.
- The API gate (`apps/api/src/api-server.ts:361-416`) accepts the shared secret or an active device token; every `/api/auth/*` path and `/web-auth/checks` additionally require the shared secret, so only the web server can reach Better Auth today.
- The web proxy allows only three Better Auth endpoints (`web-auth.proxy.ts:3-7`) and forwards cookie, origin and the client IP.
- Better Auth 1.7.12 is installed with magic link, database-backed rate limiting, 30-day sessions (`apps/api/src/auth/auth.ts`). Its bundled bearer plugin (`better-auth/plugins`, directory `bearer`) and built-in email/password sign-in exist in the installed package: no new dependency. The `accounts` table already has a `password` column; `rate_limits` exists. No migration is needed (assumption to confirm in build: no schema change from enabling email/password and bearer).
- `createOwnerUser` already creates the single owner row idempotently (`apps/api/src/auth/create-user.ts`).
- `api_tokens.user_id` is optional and nullable.

### Design decisions
1. **Which key the web accepts:** an active per-device token (the `pat_` kind), never the shared secret. The shared secret sits in the web server's environment and is more powerful and harder to revoke than a device token; accepting it would also make a single leak unrecoverable without redeploying both services. Recommended practice: mint a dedicated token labelled "web" so it can be revoked without touching the phone. The same code path also accepts the iOS token.
2. **Key check:** hash the pasted key, look up the active token, compare hashes with a constant-time compare, reject tokens linked to a user other than the owner, record last use. Same generic failure for unknown, revoked, or malformed keys.
3. **Owner row creation:** created (idempotent upsert of the configured owner email) at the first valid key sign-in, by the password script, and by the existing create-user script. "Configured" no longer needs a user row to exist; it needs the auth secret and the owner email.
4. **Owner email source:** one API environment value, set from a non-secret GitHub variable in the deploy workflow (see todo "auth-config"). Only that email can sign in by any method; sign-up stays disabled.
5. **Email and password:** Better Auth built-in email/password with sign-up disabled, minimum length 12, Better Auth's own hashing. The password is set only by an owner-run script with a hidden prompt (never argv, env, logs, files). Re-running the script rotates it and ends all existing sessions.
6. **Native sessions:** enable the bundled bearer plugin so email/password sign-in also returns a session token header; the API gate accepts that token as a third credential. Native sign-in endpoints get a narrow carve-out from the shared-secret-only rule: email/password sign-in, sign-out and session lookup only. Web-only key sign-in stays behind the shared secret (reachable only via the web server).
7. **Old path stays:** device tokens and the shared secret keep working exactly as before on all non-auth routes. Retirement of the device-token path is out of scope until the native sign-in ships and the owner decides.
8. **Rate limits:** Better Auth database rate limiting with custom per-path rules for key sign-in and email/password sign-in (5 attempts per 60 seconds per client IP), keyed on the forwarded real client IP already plumbed through the proxy. The key is 256 bits of randomness so online guessing is infeasible; the limit protects the password method and caps noise.
9. **CSRF/origin:** sign-in endpoints sit inside the Better Auth handler, whose origin check covers cookie requests; build verifies a foreign or missing Origin with a cookie is refused. Cookie: httpOnly, Secure (https base URL), SameSite lax, 30-day sliding session, one session per sign-in.
10. **No secrets in URLs or logs:** key and password travel only in POST bodies; the API request logging and error handlers must not emit bodies (verified by a test); failures return one fixed message.
11. **Sign-out:** the existing sign-out endpoint ends the session for cookie and bearer callers.
12. **Revocation and rotation (documented, scripted):** leaked web key: mint a new one, run the revoke script (revokes the token and ends all owner sessions). Leaked password: re-run set-password. Leaked auth secret: change `BETTER_AUTH_SECRET` (invalidates all signed cookies/tokens). Leaked shared secret: rotate `PROD_API_SHARED_SECRET` (existing process).

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|-------------------|
| decideKeyEligibility | token row (revoked, owner link), owner id | accept or reject | 1, 2, 3 |
| deriveWebAuthState | secret present, owner email present, session valid | unconfigured, signed_out, signed_in | 1, 7 |
| isOwnerEmail | submitted email, configured owner email | boolean (case-insensitive, trimmed) | 4, 5 |
| classifyCredential | Authorization header | shared secret, device token, session token, none | 9, 10 |
| validateNewPassword | typed password, confirmation | ok or reason | 6 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|----------------|----------------------|
| 1 key sign-in | api-key sign-in plugin, owner-user module, auth setup | login form, browser helpers, proxy allowlist | None |
| 2 bad key | same plugin, rate-limit rules | login form error | None |
| 3 revoked key | token lookup reuse, revoke script | None | None |
| 4 password sign-in | auth setup (email/password, owner-only hook) | login form | None |
| 5 other email | auth setup hook | None | None |
| 6 set or rotate password | set-password script | None | None |
| 7 unconfigured fix | auth status, env validation | None (middleware unchanged) | deploy workflow variables |
| 8 magic link optional | auth setup unchanged, env validation | login form hides nothing, copy | None |
| 9 native sign-in | auth setup (bearer), API gate, controller carve-out | None | None |
| 10 old apps | API gate (unchanged order for old credentials) | None | None |
| 11 sign-out | existing sign-out via proxy | sign-out button unchanged | None |
| 12 key rotation | revoke script | None | None |
| 13 native app | None (contract only) | Swift app (later build) | None |

### Files to create
- apps/api/src/auth/api-key-sign-in.plugin.ts (+ test): Better Auth plugin adding key sign-in.
- apps/api/src/auth/owner-user.ts (+ test): configured owner email, ensure-owner, owner-only check.
- apps/api/scripts/set-owner-password.ts (+ test of its pure parts): hidden-prompt password set/rotate.
- apps/api/scripts/revoke-api-token.ts: revoke a device token by label or id and end owner sessions.
- docs/architecture/web-auth/web-auth.md: current-state auth doc.

### Files to modify
- apps/api/src/shared/env.ts, env.auth.test.ts: owner email setting; secret required in production regardless of email provider; email provider settings stay optional.
  used by: auth.ts, auth-status.ts; tests: env.auth.test.ts
- apps/api/src/auth/auth.ts: enable email/password (sign-up off, min length 12), bearer plugin, key plugin, custom rate-limit rules, owner-only hook. Magic link stays registered only when an email key exists. Must not change: session lifetime, cookie rules, client IP header.
  used by: web-auth.controller.ts, auth-status.ts; tests: auth.integration.test.ts
- apps/api/src/auth/auth-status.ts, auth-status.test.ts: new configured definition; no user count.
- apps/api/src/api-server.ts and web-auth.controller.ts (+ web-auth.route.test.ts): third credential type, native carve-out, remove shared-secret-only for the carved-out paths only.
- apps/api/src/auth/create-user.ts: reuse for ensure-owner.
- apps/api/package.json: scripts only.
- apps/web/src/web-auth/web-auth.proxy.ts, .test.ts: allow key and password sign-in endpoints.
- apps/web/src/web-auth/web-auth.browser.ts, .test.ts, login-form.tsx, login-form.test.tsx: two methods plus optional link.
- .github/workflows/deploy.yml: pass owner email variable; keep existing secrets lines.
- docs/architecture/mobile-study-review-app.md, docs/architecture/local-dev.md, apps/ios/README.md: auth sections.

### Risk & rollout
- A leaked key means full access; mitigated by dedicated revocable key, scripted revoke that also ends sessions, rate limits, and a documented rotation. Tradeoff vs the shared secret documented in decision 1.
- Opening a few auth paths to unauthenticated callers on the API (native email/password) increases exposure to online password guessing; rate limit plus 12-character minimum plus owner-only email bound it.
- Existing iOS/Mac apps and the Chrome extension keep their credentials; the gate order for them does not change.
- Needs owner steps before it is useful: auth secret and owner email set in GitHub, a deploy, a minted web key, optional password set against the production database. Deploys and Neon operations are owner-run or explicitly granted.
- Rollback: revert the deploy; no data migration to undo; created owner row and password account are harmless.

### Documentation changes
- docs/architecture/web-auth/web-auth.md (create): methods, session lifecycle, credential order, rotation, rate limits.
- docs/architecture/mobile-study-review-app.md: authentication section gets the session-token path next to the device token.
- docs/architecture/local-dev.md: how to set owner password and mint a web key locally.
- apps/ios/README.md: sign-in section marked "planned" until the native build ships.

### Decisions made autonomously
- Shared secret not accepted for web sign-in: server-to-server credential, wider blast radius.
- No new dependency: bearer plugin and email/password are in the installed Better Auth.
- Key sign-in is web-only behind the shared secret; native uses its device token or email/password.
- Session length stays 30 days sliding; sign-in rate limit 5 per minute per IP.
- Magic link left in place but gated on an email key being present; not required.
- Owner row created lazily so "configured" no longer depends on user count.

### Implementation order
1. auth-config, owner-identity (parallel)
2. better-auth-core, then api-key-sign-in-endpoint, api-gate-and-status
3. owner-scripts, web-login (parallel)
4. docs, native-apple-sign-in (plan items only), rollout-owner-steps

### Scope boundary
- Retiring device tokens or the shared secret for native apps: out.
- Swift implementation: later build, plan items only here.
- Multi-user accounts, sign-up, password reset by email, two-factor: out.
- Adding the email provider key: not needed.
