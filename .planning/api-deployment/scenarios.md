---
type: scenarios
branch: learn-from-doc-site
task: Host post-anki (API, database, live sync, web) for the owner's iPhone app, dev + prod, under $10/month
state: confirmed
updated: 2026-10-24
---
# Scenarios: post-anki hosting for the iPhone app

All scenarios are owner-observable. Every step that rents a server, changes DNS, writes to a hosted database or deploys is run by the owner from the runbook; the implementer only writes config, scripts and docs and proves them locally.

## Business Scenarios

SCENARIO 1: Phone reaches the prod API from anywhere — asked

With the server address set to the prod API address and a prod token saved in Settings, the iPhone app loads the owner's real subjects and cards over mobile data, away from home.

What to verify:
- The prod API address answers over https with a certificate the phone trusts; plain http only redirects.
- The health check answers "ok" without a token; a data request with the saved token returns the owner's subjects.
- The same data request without a token, or with a dev token, is refused as unauthorized.
- Background extraction started from the phone finishes after the starting request has returned.

Manual verification (real environment):
- [ ] On the phone, over mobile data, the subject list and review queue load from prod.
- [ ] Adding a link from the phone produces cards a few minutes later.

SCENARIO 2: Dev is separate from prod — asked

The owner points the phone at the dev API address with a dev token and sees dev data only; nothing done in dev changes prod data, secrets or spend limits.

What to verify:
- Dev has its own addresses, database, secrets, live-sync process and daily LLM spend cap.
- A dev token is refused by prod and a prod token is refused by dev.
- Redeploying or stopping dev leaves prod answering normally.

Manual verification (real environment):
- [ ] Phone switched to the dev address shows dev data, then switched back shows prod data.

SCENARIO 3: The server's databases start from the owner's local data — asked

The owner's local database (the real working copy, latest schema) is copied once into the prod database on the server, and dev starts from the same copy, so the phone sees what the owner sees locally.

What to verify:
- A read-only status check reports, per environment, the schema level versus the code's latest, the vector extension version (must support half-precision vectors) and row counts per table.
- The copy refuses to write into a database that already holds tables, and refuses without a typed confirmation.
- After the copy, the status check shows the latest schema and the same row counts as local.
- The old hosted database used by the old server is never written to.

Manual verification (real environment):
- [ ] Status check on prod and dev after the copy matches local row counts and schema level.

SCENARIO 4: Schema changes reach dev, then prod, only through the existing migration tool — asked

New schema changes are applied by the project's existing migrate command before new code goes live in an environment; schema is never pushed directly.

What to verify:
- Deploy takes a backup, runs the existing migrate command against that environment, and stops if it fails.
- The status check reports "behind by N" before and "matches" after.
- Migrating prod asks for a typed confirmation.

SCENARIO 5: Promote dev to prod — asked

Once a version works in dev, the owner promotes exactly that version to prod with one command.

What to verify:
- Promotion refuses if the version is not the one live in dev, if there are uncommitted changes, or if dev's smoke check fails now.
- Promotion reuses dev's exact images, backs up prod, migrates prod, switches prod, then runs the prod smoke check.
- The final output states plainly whether prod is healthy.

SCENARIO 6: Roll back a bad release — asked

If prod misbehaves after a promotion, the owner returns it to the previous working version.

What to verify:
- Switching prod back to an earlier version is one command using images still kept on the server.
- Database rollback restores the backup taken right before that release's migration, documented step by step.
- Until the old server is retired, pointing the prod addresses back at it is a documented DNS change.

SCENARIO 7: Web app in the browser, private, with live sync — asked

The owner opens the prod web address in a browser, passes a password prompt, and sees views that update live as data changes.

What to verify:
- Both web addresses ask for a password before showing anything; the API addresses do not (they use tokens).
- Live-sync views load and update; the sync engine and the database are not reachable from the internet.

Manual verification (real environment):
- [ ] Grading a card on the phone updates the web view without a reload.

## Technical/Architectural Scenarios

SCENARIO 8: Domain cutover without breaking the phone — asked

Prod addresses currently point at the old server; they move to the new server only after dev passes its smoke check on the new server.

What to verify:
- Dev addresses are new and go live first; prod addresses move by one setting flip in the infrastructure config.
- Certificates are issued automatically once an address points at the new server.
- The runbook gives the short-lived records and the expected minute or two of certificate issuance at cutover.

SCENARIO 9: Monthly cost stays under $10 and every paid step is visible — asked

The owner reads one runbook listing every manual step in order, with the exact command and its monthly cost, and the total stays under $10.

What to verify:
- The runbook's "Manual steps (owner runs, costs money)" list covers server rental, DNS, secrets, database copy, deploy, cutover, promotion and rollback.
- A line-by-line monthly cost table with sources totals under $10, or says plainly which line breaks it.
- No secret value appears in any committed file, image, script output or log line written by the scripts.
