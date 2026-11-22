# Research

## Facts
- Fact: `.product/SCENARIOS.md` contains only the header '# Scenarios' and no scenarios. The coverage audit also records it as empty, with nothing to cover. (source: .product/SCENARIOS.md:1)
- Fact: The backend coverage audit says SCENARIOS.md is empty and marks it N/A, so no product scenarios exist to check the API or bot against. (source: .product/BACKEND-COVERAGE.md:41)
- Fact: The Cloud Scheduler job that fires the daily push needs the API deployed to Cloud Run. The audit lists this as not backend-domain. `.inbox/TODOS.md` says the IaC now defines web, bot and api services plus a daily scheduler job that POSTs the bot's `/push`. (source: .product/BACKEND-COVERAGE.md:79)
- Fact: The deployment TODOs list a runbook for the first deploy. It covers DNS records, setting the Telegram webhook, running `/today` and triggering the scheduler once. All of its checkboxes are unchecked. (source: .inbox/TODOS.md:40)
- Fact: T10 defines done as the prod bot answering `/start` against the shared Neon DB. The verification is described in prose only, with no automated check. (source: .bmad/telegram-frontend/T10-deploy-prod-bot.md:12)
- Fact: `apps/web/Dockerfile` exists. The TODOs still list creating it as an unchecked step, and `PROD_WEB_ENABLED` is to stay unset until the build works. The TODOs may be out of date. (source: .inbox/TODOS.md:35)
- Fact: Test files exist for `apps/extension`, `apps/mobile` and `apps/anki-batch-mcp`. My glob covered only `*.test.ts` and `*.spec.ts`, so I did not look at the bot or web. (source: apps/mobile/src/api/client.test.ts)

## Open questions
- Open question: Gap 1 (doc): write the user scenarios into `.product/SCENARIOS.md`, for example the daily push, the Socratic probe, capture through the extension and the /decide flow. They would be derived from the covered behaviours in the audit. Which scenarios the owner wants is not stated anywhere.
- Open question: Gap 2 (test): add a post-deploy smoke test that checks the bot's webhook configuration, the bot's `/push` endpoint auth and the API's `GET /daily-push` against the prod URLs. It would read URLs and secrets from the environment. Whether the owner wants this in CI is not stated.
- Open question: Gap 3 (doc): reconcile `.inbox/TODOS.md` with the current repo. The web Dockerfile now exists, so step 4 may be stale. Which unchecked items are already done is not recorded anywhere I read.
