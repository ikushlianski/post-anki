# Research

## Facts
- Fact: The bot's POST /push returns 401 unless the Authorization header equals `Bearer <TELEGRAM_WEBHOOK_SECRET>`. On a valid secret it returns 200 immediately and runs the daily push in the background, which sends a Telegram message. A smoke test can therefore check the 401 path safely, but a valid-auth call triggers a real push. (source: apps/bot/src/server.ts:149-186)
- Fact: The bot exposes GET /_healthz, which returns 200 'ok'. (source: apps/bot/src/server.ts:143-147)
- Fact: The Telegram webhook endpoint compares a secret header (SECRET_HEADER) against TELEGRAM_WEBHOOK_SECRET. (source: apps/bot/src/server.ts:242)
- Fact: The existing set-webhook script calls Telegram's setWebhook with secret_token = TELEGRAM_WEBHOOK_SECRET. No getWebhookInfo usage was found in the repo. (source: apps/bot/scripts/set-webhook.ts:11-16)
- Fact: The API serves GET /daily-push (route name dailyPush). The web app uses it as a pull path, and the bot's POST /push is the Telegram delivery path. (source: apps/api/src/router-table.ts:380)
- Fact: Mobile and extension docs describe GET /daily-push as called with `Authorization: Bearer <token>`. (source: docs/architecture/mobile-study-review-app.md:81)
- Fact: Prod URLs are bot.postanki.ilya.online, api.postanki.ilya.online and postanki.ilya.online. The webhook is set to https://bot.postanki.ilya.online/telegram. (source: .inbox/TODOS.md:25)
- Fact: The prod GitHub environment holds PROD_TELEGRAM_BOT_TOKEN, PROD_TELEGRAM_WEBHOOK_SECRET, PROD_API_SHARED_SECRET and the PROD_API_DOMAIN and PROD_BOT_DOMAIN variables. A CI smoke test can read these from there. (source: .inbox/TODOS.md:13-25)
- Fact: .github/workflows/deploy.yml has jobs checks, unit, integration, test, infra, deploy (bot), deploy-api and deploy-web, plus a workflow_dispatch trigger. The deploy jobs already do inline curl health checks on /_healthz and /login. A standalone smoke check would be a separate workflow or script rather than a deploy step. (source: .github/workflows/deploy.yml:8-438)
- Fact: A Cloud Scheduler job, post-anki-daily-push, POSTs to the bot's /push, sending telegramWebhookSecret as the bearer. (source: infra/index.ts:309-323)
- Fact: scripts/ already holds a smoke-style script, source-items-smoke.mjs, run with `node --import tsx`. It is a possible convention for where the test lives. (source: scripts/source-items-smoke.mjs:10)

## Open questions
- Open question: How does the API authenticate GET /daily-push in prod (API_SHARED_SECRET bearer, a PAT, or a session)? I could not find the guard code, so the smoke test's credential is unknown.
- Open question: Should the /push auth check use only a negative case (a wrong or missing bearer returns 401, no message sent), or also a valid-secret call? A valid call sends a real Telegram message to the owner.
- Open question: What should 'webhook config' assert? Candidates are that getWebhookInfo url equals the bot /telegram URL, there is no last_error_message, and pending_update_count is low. It needs TELEGRAM_BOT_TOKEN, and no existing code calls getWebhookInfo.
- Open question: Where should the test run: a local script, a separate GitHub workflow (manual or scheduled), or a job after deploy? The ticket says 'post-deploy' but also 'without deploying anything'.
