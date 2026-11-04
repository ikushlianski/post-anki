---
type: scenarios
branch: learn-from-doc-site
task: Deploy the post-anki API (prod only) on AWS Fargate Spot as cheaply as possible
state: confirmed
updated: 2026-10-25
---
# Scenarios: post-anki API on Fargate Spot

## Business Scenarios

SCENARIO 1: Phone uses the prod API over https with its own token — asked

The owner's iPhone, left on its built-in server address, loads subjects and grades cards against the hosted API using a token minted for that phone.

What to verify:
- The built-in address answers over https with a publicly trusted certificate; plain http redirects to https.
- A request carrying the phone's token gets the owner's data.
- The health address answers without a token.
- Live sync is not offered; the phone works without it.

Manual verification (real environment):
- [ ] On the real phone, with mobile data and on Wi-Fi, the subject list loads and a grade is saved.

SCENARIO 2: Requests without a valid token are refused — asked

Anyone who finds the address gets nothing back without a valid token.

What to verify:
- A data request with no token, or a wrong one, is refused as unauthorized.
- The shared server secret is always set in prod, so the "no secret means open" fallback can never apply.
- A revoked phone token stops working on the next request.

SCENARIO 3: AWS takes the server back and it comes back by itself — asked

AWS stops the running server with two minutes' warning; a replacement starts and the API answers again at the same address within a few minutes, with no owner action.

What to verify:
- A replacement starts automatically and the address follows it to the new server.
- While it is down, the phone shows its "you're offline, try again" message and nothing is half-saved on the phone.
- Pulling to refresh after the gap works.
- A missed address update is corrected by the periodic check within five minutes.

SCENARIO 4: No spare capacity, owner switches to regular capacity — asked

When AWS has no spare capacity and the API stays down, the owner switches to regular (non-discounted) capacity with one setting and switches back later.

What to verify:
- One setting change plus one infrastructure run moves the API to regular capacity, at the price shown in the runbook.
- Switching back restores the discounted mode.
- The runbook says how to tell "no capacity" apart from a crash.

SCENARIO 5: Certificate survives restarts and deploys — asked

A replacement server reuses the certificate already issued instead of asking for a new one, so frequent restarts never hit the certificate authority's weekly limit.

What to verify:
- After a restart the API serves https immediately with the same certificate.
- Ten restarts in a week request no new certificate.
- Renewal happens on its own before expiry.

SCENARIO 6: Owner ships a new version and can go back — asked

The owner builds and ships a new API version with one command; a version that fails its health check is rolled back automatically, and the owner can go back to any earlier version with one command.

What to verify:
- A deploy replaces the server with the new version, with at most about a minute of errors.
- A version that never becomes healthy is rolled back to the previous one automatically.
- The rollback command brings back a named earlier version and the smoke check passes.

SCENARIO 7: Neon database is brought up to date and can be recovered — asked

Before the API goes live, the owner checks the Neon database read-only, takes a backup, applies the missing schema changes with the existing migrate command, and can restore if something goes wrong.

What to verify:
- The status check shows which schema changes are missing, the vector extension version, and the size against the free plan's limit, and writes nothing.
- The migrate step always takes a labelled backup first and refuses to run without explicit confirmation.
- A weekly backup lands on the owner's Mac; restoring it into a scratch database works.
- The deploy command refuses to ship a version whose schema changes are not yet in the database.

SCENARIO 8: Secrets are entered once and never shown — asked

The owner types the database address, AI key and server secret once; they reach the running API without appearing in the infrastructure state, logs, shell history or the repository.

What to verify:
- The secrets script reads values hidden and stores them encrypted in AWS.
- The infrastructure state and the server's settings hold only the secret names.
- No script prints a secret value, and no script reads local env files.

SCENARIO 9: Monthly spend stays inside the budget — asked

Hosting costs about $6 a month and stays there: AI spending stops at a daily cap, AWS emails the owner before the monthly budget is crossed, logs are deleted after a week, and the database sleeps when unused.

What to verify:
- Once the day's AI spend reaches the cap, AI features stop until the next day; other features keep working.
- An AWS budget alert emails the owner at 80% of $10 actual and 100% forecast.
- Logs older than 7 days are deleted.
- With the phone idle, the database compute goes to sleep after about five minutes.

SCENARIO 10: Running the infrastructure creates only the Spot API — asked

The infrastructure already in the repo also describes a load balancer, three other services, live sync and a serverless API; running it now creates only the cheap Spot API pieces unless the owner turns the others on.

What to verify:
- A preview with default settings lists no load balancer, no live-sync, web or bot service and no serverless API.
- Turning the old parts on still works as before.
- No resource from this work needs a secret value in the infrastructure settings.

SCENARIO 11: The API name moves from GCP to AWS — asked

The owner replaces the hand-made GCP record for the API name with the AWS-managed one; the phone keeps its built-in address and reaches the new server.

What to verify:
- After cutover, the API name resolves to the running AWS server.
- The web name stays as it is.
- Pointing the API name back at GCP is a documented one-command step.

SCENARIO 12: Owner follows the runbook end to end — asked

The owner goes from nothing to a working phone using only the runbook, with every paid step and its monthly cost listed.

What to verify:
- A section titled "Manual steps (owner runs, costs money)" lists each step in order with its command and cost.
- The cost table matches the plan line by line with sources.
- Phone setup, token revocation, backup, rollback, capacity switch and teardown each have a section.

## Technical/Architectural Scenarios

Covered above: address following (SCENARIO 3), certificate reuse (SCENARIO 5), automatic rollback (SCENARIO 6).
