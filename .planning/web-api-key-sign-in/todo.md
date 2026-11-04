# Todo: web-api-key-sign-in

## auth-config

### Goal
- Production can run web sign-in with only an auth secret and an owner email, no email provider.

### Criteria
- [x] The API starts in production without an email provider key
- [x] The auth secret is required in production and must be long enough
- [x] The owner email is read from one setting and the deploy workflow sets it from a GitHub variable
- [x] The env tests describe the new rules

### Coding tasks
- [x] Add an owner email setting to the API environment schema and validate it as an email.
- [x] Require the auth secret (minimum length) in production whether or not an email key exists; keep the email-only settings required only when an email key exists.
- [x] Update the environment tests that asserted the secret was only needed with an email key.
- [x] Pass the owner email variable to the API service in the deploy workflow; leave existing secret lines untouched.
- [x] [blocked: user] Confirm the owner email is a GitHub variable (recommended, not secret) named for production, not a secret.

### Notes
- Owns apps/api/src/shared/env.ts, apps/api/src/shared/env.auth.test.ts, .github/workflows/deploy.yml
- Depends on none

## owner-identity

### Goal
- One place decides who the owner is and creates that user safely and repeatedly.

### Criteria
- [x] Ensuring the owner twice creates one user
- [x] Email comparison ignores case and spaces
- [x] Anyone else is never the owner

### Coding tasks
- [x] Add a module that reads the configured owner email, checks a submitted email against it, and ensures the owner row exists using the existing idempotent create.
- [x] Add tests for repeat calls, case differences and a different email.
- [x] Make the existing create-user helper reusable by the module without changing its behaviour.

### Notes
- Owns apps/api/src/auth/owner-user.ts, its test, apps/api/src/auth/create-user.ts, apps/api/src/auth/create-user.test.ts
- Depends on auth-config

## better-auth-core

### Goal
- Better Auth supports owner-only email and password, native session tokens, and tight sign-in rate limits, with magic link optional.

### Criteria
- [x] Sign-up is disabled and any non-owner email gets the generic failure
- [x] Passwords shorter than 12 characters are rejected
- [x] Sign-in attempts are limited per client IP in the database store
- [x] Email and password sign-in also returns a session token for native callers
- [x] The API starts and signs in with no email provider key

### Coding tasks
- [x] Turn on built-in email and password with sign-up disabled, minimum length 12 and no email verification step.
- [x] Add the bundled bearer plugin from the installed Better Auth so sessions can be sent as a token.
- [x] Add a before-sign-in rule that rejects any email other than the owner with the same error as a wrong password.
- [x] Add custom rate-limit rules for the key, password and sign-out paths (5 per minute per IP for sign-in).
- [x] Register magic link only when an email key exists, and register the key sign-in plugin.
- [x] Extend the integration test to cover owner-only, sign-up refusal, rate limiting and token return.

### Notes
- Owns apps/api/src/auth/auth.ts, apps/api/src/auth/auth.integration.test.ts
- Depends on owner-identity

## api-key-sign-in-endpoint

### Goal
- Pasting a valid device key creates a normal owner session; anything else gets one generic failure.

### Criteria
- [x] A valid active key returns a session cookie for the owner and creates the owner on first use
- [x] Unknown, revoked, malformed, empty and other-user keys all give the same response
- [x] The comparison of key hashes is constant time and last use is recorded
- [x] Neither the key nor its hash appears in logs or error output
- [x] Foreign origin is refused

### Coding tasks
- [x] Add a Better Auth plugin with a POST key sign-in endpoint taking the key in the body only.
- [x] Reuse the existing hash and active-token lookup; reject tokens linked to a different user; compare hashes with a constant-time compare.
- [x] Ensure the owner exists, create the session and set the cookie using Better Auth's own session helpers.
- [x] Return one fixed error body for every failure and make sure no log call receives the key.
- [x] Add tests for each criterion, including a log-capture test and a revoked key.

### Notes
- Owns apps/api/src/auth/api-key-sign-in.plugin.ts, apps/api/src/auth/api-key-sign-in.plugin.test.ts
- Depends on owner-identity, better-auth-core

## api-gate-and-status

### Goal
- The API accepts session tokens from native callers, keeps the old credentials, and the web is no longer reported as unconfigured when it is set up.

### Criteria
- [x] Shared secret and device tokens behave exactly as before on every route
- [x] A valid session token is accepted; expired, revoked or tampered ones are refused
- [x] Only email and password sign-in, sign-out and session lookup are reachable without the shared secret; key sign-in and the rest of the auth paths still need it
- [x] Status is unconfigured only when the auth secret or owner email is missing
- [x] A missing user row no longer means unconfigured

### Coding tasks
- [x] Add a credential classifier and a third accepted credential (session token) to the gate after the two existing ones.
- [x] Let the three native auth paths bypass the shared-secret-only rule and the up-front gate, still rate limited and origin checked.
- [x] Rewrite the session status check to use secret plus owner email; remove the user count and its caching.
- [x] Update the status tests that expected unconfigured for no email key and for no user, and remove the user-count caching tests.
- [x] Update the route tests for the gate, add tests for the carve-out and for old credentials still passing.

### Notes
- Owns apps/api/src/api-server.ts, apps/api/src/auth/web-auth.controller.ts, apps/api/src/auth/auth-status.ts, apps/api/src/auth/auth-status.test.ts, apps/api/src/auth/web-auth.route.test.ts
- Depends on better-auth-core, auth-config

## owner-scripts

### Goal
- The owner can set and rotate the password and revoke a key from the command line without secrets leaking.

### Criteria
- [x] The password is read with hidden typing, twice, and never passed as an argument or printed
- [x] Setting the password again replaces it and ends all owner sessions
- [x] Revoking a key marks it revoked and ends all owner sessions
- [x] Scripts refuse to run against a non-local database unless the owner passes an explicit confirmation flag

### Coding tasks
- [x] Add a set-owner-password script using Better Auth's own hashing, a hidden prompt and the minimum-length rule.
- [x] Add a revoke-key script by label or id that revokes and clears sessions.
- [x] Add package scripts for both next to the existing create-user script.
- [x] Add tests for the pure parts: password validation and revoke selection.
- [x] [blocked: user] Hidden prompt without a new dependency (recommended: Node's built-in terminal input with echo off) or add a prompt library.

### Notes
- Owns apps/api/scripts/set-owner-password.ts, apps/api/scripts/revoke-api-token.ts, apps/api/package.json
- Depends on owner-identity, better-auth-core

## web-login

### Goal
- The login page plainly offers "paste your key" or "email and password", with the email link as an optional third.

### Criteria
- [x] Key and password forms each show one generic failure and a separate too-many-attempts message
- [x] The key field is a password-type input that is not remembered or logged
- [x] The email-link option shows only when available
- [x] Successful sign-in lands on the home page; sign-out unchanged

### Coding tasks
- [x] Add key sign-in and password sign-in calls and outcome types to the browser helpers.
- [x] Allow both new endpoints in the web proxy allowlist with POST only.
- [x] Rebuild the login form with a method choice, the two forms and the optional link form.
- [x] Learn availability of the email link from a non-secret setting or the status result without a new secret.
- [x] Update the proxy, browser and form tests and add tests for each outcome message.

### Notes
- Owns apps/web/src/web-auth/web-auth.proxy.ts, web-auth.proxy.test.ts, web-auth.browser.ts, web-auth.browser.test.ts, login-form.tsx, login-form.test.tsx, apps/web/src/routes/login.tsx
- Depends on api-key-sign-in-endpoint, better-auth-core

## docs

### Goal
- Current-state docs describe the sign-in methods, credential order, rotation and revocation.

### Criteria
- [x] A new web auth doc exists with methods, sessions, rate limits and rotation steps
- [x] The mobile auth doc mentions the session-token path next to the device token
- [x] Local setup docs explain minting a key and setting the password

### Coding tasks
- [x] Create the web auth architecture doc in present tense with the credential order and rotation table.
- [x] Update the mobile study app auth section and the iOS readme (sign-in marked planned).
- [x] Update local dev docs for the new scripts.

### Notes
- Owns docs/architecture/web-auth/web-auth.md, docs/architecture/mobile-study-review-app.md, docs/architecture/local-dev.md, apps/ios/README.md
- Depends on api-gate-and-status, owner-scripts

## native-apple-sign-in

### Goal
- Plan only: the Apple apps can sign in with email and password and use a session token, while the old device token keeps working.

### Criteria
- [ ] Existing installs with only a device token are untouched until the owner signs in
- [ ] The session token is stored only in the Keychain
- [ ] Revocation or expiry returns the user to sign-in cleanly

### Coding tasks
- [ ] Plan a sign-in screen on Settings and first launch: email, password, generic error, rate-limited message.
- [ ] Plan Keychain storage of the session token separate from the device token, and token send on every call over https only.
- [ ] Plan sign-out: call the sign-out endpoint, then clear the token and cached account state.
- [ ] Plan expiry handling: check the session on launch and when a call returns unauthorized, then re-prompt; the session slides forward on use.
- [ ] Plan revoke handling: unauthorized on a session token clears it and shows sign-in without wiping local data.
- [ ] Plan precedence: use the session token if present, else the device token; remove the device token option only after the owner decides.
- [ ] [blocked: user] Schedule the Swift build and the date the old device-token path may be retired (recommended: keep it until the native sign-in has shipped and been used for a release).

### Notes
- Owns apps/ios/Sources/**, apps/ios/Packages/** (Swift, built later; no files changed by this plan)
- Depends on api-gate-and-status, better-auth-core (contract: email/password sign-in returns a session token header; calls send it as a Bearer credential; sign-out and session lookup endpoints)

## rollout-owner-steps

### Goal
- The owner knows exactly which GitHub settings to set and which steps are theirs.

### Criteria
- [ ] Secrets and variables are listed by name only
- [ ] Deploys and Neon operations are marked owner-run or explicitly granted

### Coding tasks
- [ ] [blocked: user] Confirm the production shared secret exists, then require it at API start-up.
- [ ] [blocked: user] Set GitHub secret for the auth secret (production Better Auth secret, at least 32 random characters) if not already set; keep the existing shared secret secret.
- [ ] [blocked: user] Set the GitHub variable holding the owner email; the public web URL variable already has a default and is only needed if the address differs.
- [ ] [blocked: user] Run or approve the deploy of the API then web through the existing workflow; no database migration is expected.
- [ ] [blocked: user] Mint a dedicated web key against the production database and store it in a password manager.
- [ ] [blocked: user] Optionally set the owner password against the production database with the script; explicit grant needed for any Neon access.
- [ ] Record the rotation and revoke steps in the web auth doc.

### Notes
- Owns none (owner actions)
- Depends on api-gate-and-status, api-key-sign-in-endpoint, web-login, owner-scripts
