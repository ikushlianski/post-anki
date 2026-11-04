---
type: scenarios
branch: learn-from-doc-site
task: web-api-key-sign-in
state: draft
updated: 2026-10-25
---
# Scenarios: web sign-in with key, password and native sessions

## Business Scenarios

SCENARIO 1: Sign in to the web with the app key — asked

The owner opens the login page, pastes a valid device key once, and lands in the app signed in for 30 days.

What to verify:
- The first valid key creates the owner account if it does not exist yet and signs in as that single owner.
- The browser receives a secure, script-hidden session cookie; the key appears in no address, log line or stored page state.
- After sign-in every page and action works as it does after a magic-link sign-in.

SCENARIO 2: Wrong key — asked

A wrong, malformed or empty key shows one generic "could not sign in" message, never saying why.

What to verify:
- Same message and response shape for unknown, malformed and revoked keys.
- After five failed tries in a minute from one address further tries are refused with a "too many attempts" message.
- A request from a foreign site origin is refused.

SCENARIO 3: Revoked key stops working — asked

After the owner revokes the web key, pasting it fails, and the owner is signed out everywhere.

What to verify:
- A revoked key behaves exactly like an unknown key.
- Existing web sessions end when the revoke script runs.

SCENARIO 4: Sign in with email and password — asked

The owner enters the owner email and password on the login page and is signed in.

What to verify:
- Correct pair signs in; wrong password shows the same generic message as scenario 2.
- Repeated failures hit the same rate limit.
- Passwords shorter than 12 characters are never accepted by the set-password script.

SCENARIO 5: Any other email is refused — asked

Typing any email other than the owner's, or trying to register, always fails with the generic message.

What to verify:
- No account can be created through the sign-in screen or the API.
- The failure is indistinguishable from a wrong password.

SCENARIO 6: Owner sets or rotates the password — asked

The owner runs a script that asks for the password twice with hidden typing; running it again replaces the password and signs out all sessions.

What to verify:
- The password never appears in the command line, shell history, logs or files.
- Old password stops working after rotation; mismatched confirmation or too-short password stores nothing.

SCENARIO 7: The web stops saying "not configured" — asked

Once the auth secret and owner email are set in production, the web shows the login page instead of the 503 error, with no email provider needed.

What to verify:
- Signed-out visitors are redirected to login; signed-in visitors proceed.
- Missing secret or owner email still shows the unavailable message in production.

SCENARIO 8: Magic link is optional — asked

The login page offers key and password plainly; the email-link option appears only when an email provider is set up and never blocks the other methods.

What to verify:
- With no email provider key the service starts and both other methods work.
- With one, the link flow behaves as it does today.

SCENARIO 9: Native app signs in with email and password — asked

A native app can sign in with the owner email and password, receive a session token, and call the API with it instead of a device key.

What to verify:
- A valid session token is accepted on normal API calls; expired, revoked or tampered tokens get "unauthorized".
- Sign-out ends the token; password rotation ends it too.
- The native sign-in path does not need the shared secret and is rate limited.

SCENARIO 10: Installed apps keep working — asked

Already installed iOS and Mac apps sending the device token, and the web server using the shared secret, are unaffected by this release.

What to verify:
- Device tokens and the shared secret still work on every route as before.
- Revoked device tokens still fail.

SCENARIO 11: Sign out — asked

Signing out on the web removes the session; the old cookie no longer works.

What to verify:
- Works for sessions created by key, password or magic link.

SCENARIO 12: Rotate a leaked key — asked

The owner mints a new key, revokes the old one, and the old one fails immediately while the new one works.

What to verify:
- The steps are documented and scripted; no redeploy needed.

SCENARIO 13: Native app experience (plan only) — asked

On first launch without credentials the app shows a sign-in screen, keeps the session token in the Keychain, refreshes the session when needed, and returns to sign-in when the server says the session was revoked.

What to verify:
- Existing device-token users are not forced to sign in until they choose to.
- Revoke or password rotation sends the app back to sign-in without crashing.

## Technical/Architectural Scenarios
- Cookie and bearer paths resolve to the same owner user; a session created by either is visible to the other's checks.
- Failure of the database during sign-in returns a generic unavailable response, never a success.
