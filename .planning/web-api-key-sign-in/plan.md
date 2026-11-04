---
type: plan
branch: learn-from-doc-site
task: web-api-key-sign-in
state: draft
updated: 2026-10-25
---
# Plan: web sign-in with key, password and native sessions

Better Auth stays the one session authority. Three methods (device key, owner email and password, optional magic link) all create the same owner session; the API gate also accepts a Better Auth session token so native apps can later stop sending device keys. No migration, no new dependency, old credentials unchanged.

**Legend:** ➕ add · ✏️ change · ➖ remove

## 1. Database
| | Table | Change | Why |
|---|---|---|---|
| ✏️ | users, accounts, sessions, api_tokens, rate_limits | Reused as-is; owner row created lazily; password hash lives in accounts | No migration expected (confirm in build) |

## 2. Permissions
- Only the configured owner email can hold a session; sign-up disabled.
- Device tokens linked to another user are not accepted for web sign-in.

## 3. Business rules
- decideKeyEligibility: active, not revoked, owner link null or equal to owner.
- deriveWebAuthState: unconfigured only when auth secret or owner email missing.
- isOwnerEmail: trimmed, case-insensitive.
- classifyCredential: shared secret, device token, session token, none (in that order).
- validateNewPassword: at least 12 characters, matching confirmation.

## 4. Services
| | File | What it does |
|---|---|---|
| ➕ | auth/owner-user.ts | Configured owner, ensure-owner |
| ➕ | auth/api-key-sign-in.plugin.ts | Key sign-in endpoint creating a session |
| ✏️ | auth/auth.ts | Email/password, bearer plugin, rate rules, owner-only hook |
| ✏️ | auth/auth-status.ts | New configured definition |

## 5. Validation
| Schema | Fields |
|---|---|
| env | owner email (email), auth secret required in production |
| key sign-in body | key string, bounded length |

## 6. API endpoints
| | Method | Path | Who | Purpose | Errors |
|---|---|---|---|---|---|
| ➕ | POST | /api/auth/sign-in/api-key | Web server only (shared secret) | Key to session cookie | 401 generic, 429 |
| ✏️ | POST | /api/auth/sign-in/email | Anyone, rate limited (web via proxy, native direct) | Password sign-in, returns token header | 401 generic, 429 |
| ✏️ | POST/GET | /api/auth/sign-out, /api/auth/get-session | Cookie or session token | End or read session | 401 |
| ✏️ | any | non-auth routes | shared secret, device token, or session token | Gate gains third credential | 401 |

## 7. Audit log
- No audit table; sign-in failures log a fixed event name with no body, key or email content.

## 11. Tests
- Key: valid, unknown, revoked, malformed, other-user, rate limit, foreign origin, no-secret-in-logs.
- Password: right, wrong, other email, sign-up refused, short password.
- Gate: all three credentials, old ones unchanged, carve-out limited to three paths.
- Status and env tests updated: auth-status.test.ts (two unconfigured cases and two user-count cases), env.auth.test.ts (secret only needed with email key), web-auth.proxy.test.ts (allowlist), login-form.test.tsx (single magic-link form), web-auth.route.test.ts (gate), auth.integration.test.ts. web-auth.access.test.ts and the middleware keep passing (503 when unconfigured in production still holds).

## 10. Frontend
| | Where | Change |
|---|---|---|
| ✏️ | login form | Key, email and password, optional link |
| ✏️ | web proxy | Allow key and password sign-in endpoints |
| ✏️ | iOS/Mac (later build) | Sign-in screen, Keychain session token, expiry and revoke handling |

## 12. Docs
- New web-auth architecture doc; updates to mobile auth doc, local dev doc, iOS readme.

## 13. After deploy
1. Owner sets GitHub secret for the auth secret and GitHub variable for the owner email (names in the report).
2. Owner-run deploy of API then web; no migration.
3. Mint a dedicated web key; optionally set the password; both against production only by owner or with explicit grant.
4. Check login page, key sign-in, sign-out, and that the installed phone app still works.

## Out of scope
- Retiring device tokens or shared secret for native; Swift build; sign-up; email reset; two-factor.
