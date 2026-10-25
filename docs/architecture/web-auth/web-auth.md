# Web and owner sign-in

One owner signs in. Better Auth in `apps/api` is the only session authority; every method ends in the same owner session.

## Sign-in methods

| Method | Endpoint (through the web proxy) | Availability |
|---|---|---|
| Device key | `POST /api/auth/sign-in/api-key` | Always. Accepts an active `pat_` device token only, never the shared secret. A token linked to another user is refused. |
| Email and password | `POST /api/auth/sign-in/email` | Always. Only the configured owner email; sign-up is off; password of at least 8 characters. |
| Email link | `POST /api/auth/sign-in/magic-link` | Only when the API has an email provider key and the web server has `MAGIC_LINK_ENABLED=1`. |

The login page offers the key form and the email-and-password form, and the email-link form only when `MAGIC_LINK_ENABLED=1`. Key and password travel only in POST bodies. Every failure shows one generic message; a rate limit shows a separate "too many attempts" message. The secret field is cleared after each submit. The key field is a password-type input with autocomplete off.

The first valid key sign-in creates the owner user if it does not exist. The web is reported unconfigured (503 in production) only when the auth secret or the owner email is missing.

## Sessions and rate limits

- Session cookie: httpOnly, secure, 30 days, sliding.
- Sign-in paths: 5 attempts per minute per client IP, stored in the database. Sign-out: 20 per minute.
- A foreign `Origin` on key sign-in is refused.
- Email and password sign-in also returns a session token in the `set-auth-token` header for native callers.
- Sign-in failures log a fixed event name with no key, password or email.

## Credential order at the API gate

1. Shared secret (`apps/web` and `apps/bot` servers).
2. Device token (`pat_`, hash-compared, unrevoked).
3. Better Auth session token sent as `Authorization: Bearer`.
4. Otherwise 401.

Without the shared secret, only `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out` and `GET /api/auth/get-session` are reachable. Key sign-in and all other auth paths need the shared secret, which the web proxy adds.

## Settings

| Name | Where | Kind |
|---|---|---|
| `PROD_BETTER_AUTH_SECRET` | GitHub secret, becomes `BETTER_AUTH_SECRET` | Secret, at least 32 random characters, required in production |
| `PROD_OWNER_EMAIL` | GitHub variable, becomes `OWNER_EMAIL` | Not secret |
| `PROD_API_SHARED_SECRET` | GitHub secret | Secret, unchanged |
| `PROD_WEB_PUBLIC_URL` | GitHub variable | Optional; defaults to the production address |
| `PROD_RESEND_API_KEY`, `PROD_AUTH_EMAIL_FROM` | GitHub secret and variable | Only for the email link |
| `MAGIC_LINK_ENABLED` | Web server environment | Not secret; `1` shows the email-link option |

## Production setup (owner-run)

Production database commands run from the repo root with `DATABASE_URL` pointing at production and `ALLOW_REMOTE_DB_MIGRATE=1`; without it the scripts refuse any non-local database. Keep secrets in the gitignored `apps/api/.env.local` or a password manager.

1. Set the GitHub secret `PROD_BETTER_AUTH_SECRET` and the GitHub variable `PROD_OWNER_EMAIL`.
2. Deploy the API, then the web, through the existing workflow. No migration is needed.
3. Mint a dedicated web key: `npm run db:create-web-key -w @post-anki/api -- web`. It prints once; store it in a password manager.
4. Optionally set the password: `npm run db:set-owner-password -w @post-anki/api`. It reads `ILYA_USER_PASSWORD` from the environment (the gitignored `apps/api/.env.local` is loaded) and takes no argument.
5. Check the login page, key sign-in, sign-out, and that the installed phone app still works.

## Rotation and revocation

| Event | Action | Effect on sessions |
|---|---|---|
| Web key leaked | `db:create-web-key` for a new key, then `npm run db:revoke-api-token -w @post-anki/api -- <label-or-id>` | Key fails at once; all owner sessions end |
| Password leaked or changed | Run `db:set-owner-password` again | Old password fails; all owner sessions end |
| Auth secret leaked | Change `PROD_BETTER_AUTH_SECRET` and redeploy | All sessions become invalid |
| Shared secret leaked | Rotate `PROD_API_SHARED_SECRET` and redeploy API and web | Sessions unaffected |

The revoke script refuses a label shared by several active keys; pass the id instead.

## Native apps

Native apps keep sending the device token. They may sign in with email and password, keep the returned session token in the Keychain and send it as a Bearer credential. Sign-in screens are not built yet.
