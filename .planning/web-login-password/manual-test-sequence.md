# Manual test: web sign-in by magic link

Run after the owner setup (Resend domain verified, `PROD_RESEND_API_KEY`, `PROD_BETTER_AUTH_SECRET`, `PROD_AUTH_EMAIL_FROM` set, deploy done, `db:create-user kushliansky@gmail.com` run).

1. Open https://postanki.ilya.online in a private window. You land on `/login`, with no sidebar.
2. Enter an address that is not the owner's. The page says "Check your inbox", and no email arrives.
3. Enter kushliansky@gmail.com. The page says "Check your inbox", and an email arrives within a minute.
4. Click the link. You land on the home page, signed in, and the sidebar shows a Sign out button.
5. Click the same link again. You land on `/login` with a short "link expired or used" message.
6. Open `/login` while signed in. You are sent to the home page.
7. Click Sign out. You land on `/login`. Pressing Back and reloading still shows `/login`.
8. Request six links within a minute. The sixth answer says to try again later.
9. Wait more than 10 minutes after requesting a link, then click it. It is refused.
10. From the iOS app (or `curl -H "Authorization: Bearer pat_..."` against the API URL), call a normal API route. It works exactly as before, with no web sign-in involved.

Before the owner setup, every page except `/login` answers 503 "login not configured". That is expected.
