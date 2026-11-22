# Research: Should the smoke test be a standalone script (an npm script run by hand), a job in deploy.yml, a separate workflow, or a combination? Nothing in the repo or wiki decides this.

## Facts
- Fact: deploy.yml is the only prod deploy workflow. It triggers on push to main and on workflow_dispatch, and has jobs deploy (bot), deploy-api and an optional deploy-web. (source: .github/workflows/deploy.yml:5-9)
- Fact: Each deploy job already ends with an in-workflow curl health-check step, for example 'Verify deployment health' for the bot and 'Verify API health' for the API. Verification steps are an established pattern in deploy.yml. (source: .github/workflows/deploy.yml:213-227)
- Fact: The bot and API deploy as separate parallel jobs, both needing [test, infra, review-factory-gate]. A smoke test spanning bot and API would need its own job with needs: [deploy, deploy-api]. (source: .github/workflows/deploy.yml:155-157)
- Fact: The prod environment secrets PROD_TELEGRAM_BOT_TOKEN, PROD_TELEGRAM_WEBHOOK_SECRET and PROD_API_SHARED_SECRET are available to jobs with environment: prod. The bot and API URLs are resolved with gcloud run describe using the WIF auth steps. (source: .github/workflows/deploy.yml:159-211)
- Fact: The bot's POST /push requires the header 'Authorization: Bearer <TELEGRAM_WEBHOOK_SECRET>'. The Telegram webhook uses the header x-telegram-bot-api-secret-token. (source: apps/bot/src/server.ts:55)
- Fact: The bot's POST /push compares the Authorization header with Bearer TELEGRAM_WEBHOOK_SECRET using secretsEqual. (source: apps/bot/src/server.ts:149-150)
- Fact: The API exposes GET /daily-push (route name dailyPush). (source: apps/api/src/router-table.ts:380)
- Fact: The repo has a convention of standalone scripts in scripts/ (for example check-web-node-builtins.mjs, source-items-smoke.mjs). deploy.yml calls check-web-node-builtins.mjs directly with node. A smoke script in that folder would fit this pattern and could be run by hand or from CI. (source: .github/workflows/deploy.yml:39)
- Fact: release.yml is a separate workflow triggered on push to main. It only publishes a GitHub release and builds the Mac app, so it is unrelated to prod verification. (source: .github/workflows/release.yml:5-12)

## Open questions
- Open question: Whether the smoke test should also run on demand against prod without a deploy, through workflow_dispatch or a separate workflow, or only by hand with an npm script. The ticket says 'without deploying anything' but does not say how it is triggered.
- Open question: Whether a smoke-test failure should fail or block the deploy workflow. It runs after the deploys, so it cannot prevent them; it can only turn the run red or trigger a rollback or alert.
- Open question: Where a manual run gets the prod URLs and secrets (TELEGRAM_BOT_TOKEN for the webhook config, TELEGRAM_WEBHOOK_SECRET for /push auth). The script could read them from environment variables, and the person running it would supply the values. How the person holds those secrets locally is not documented.
- Open question: The auth scheme of the API's GET /daily-push (shared secret, or none) and the expected webhook URL that getWebhookInfo should return were not read. I found no setWebhook or getWebhookInfo code in the repo.
