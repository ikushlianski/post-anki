# Research: Where should the smoke test live and how is it triggered: a standalone script run by hand or npm script, a new job in deploy.yml (needs: deploy and deploy-api), a separate workflow_dispatch/workflow_run workflow, or a combination? 'Without deploying anything' rules out a deploy step but does not say which.

## Facts
- Fact: Only two workflows exist: deploy.yml and release.yml. There is no dedicated smoke or post-deploy workflow. (source: .github/workflows/)
- Fact: deploy.yml runs on push to main and on workflow_dispatch, which has one input, pulumi_refresh. (source: .github/workflows/deploy.yml:5-14)
- Fact: The `deploy` job (bot) and `deploy-api` job (API) are separate, parallel jobs, and both use `environment: prod`. (source: .github/workflows/deploy.yml:155-159)
- Fact: Each deploy job ends with its own curl retry loop on /_healthz, so health checks already live inside the deploy jobs. `deploy` does this at lines 213-227 and `deploy-api` at lines 350-364. (source: .github/workflows/deploy.yml:213)
- Fact: Prod URLs are not hard-coded. The workflow reads them with `gcloud run describe ... status.url` after authenticating through Workload Identity (vars.PROD_WIF_PROVIDER and PROD_CI_SA_EMAIL). Prod secrets such as PROD_TELEGRAM_BOT_TOKEN, PROD_TELEGRAM_WEBHOOK_SECRET and PROD_API_SHARED_SECRET are available only through `environment: prod`. (source: .github/workflows/deploy.yml:168-211)
- Fact: The bot exposes POST /push in apps/bot/src/server.ts. (source: apps/bot/src/server.ts:149)
- Fact: The API serves GET /daily-push through handleDailyPush, imported in api-server.ts. (source: apps/api/src/api-server.ts:174)
- Fact: The root package.json has npm scripts such as check:phone (which runs a scripts/*.mjs file) and models:prices. Standalone checks under scripts/ are an existing pattern, for example scripts/check-web-node-builtins.mjs, which deploy.yml runs with `node`. No smoke script exists for this ticket. (source: package.json:53)
- Fact: TODO.md lists the ticket with an empty 'Coding tasks' section and no placement guidance. (source: .planning/TODO.md:1965-1974)

## Open questions
- Open question: Should the smoke test be a standalone script (an npm script run by hand), a job in deploy.yml, a separate workflow, or a combination? Nothing in the repo or wiki decides this.
- Open question: If it runs in CI, how do the prod URLs and secrets (webhook secret, bot token, shared secret) reach it? Options are gcloud lookups plus environment: prod, or explicit env vars. Neither the ticket nor the repo says which.
