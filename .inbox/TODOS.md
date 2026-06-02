# Deployment TODOs (operational — for Ilya)

The IaC is done: Pulumi defines web + bot + api Cloud Run services, their domains,
public invokers, and a daily Cloud Scheduler job that POSTs the **bot's** `/push`.
CI (`deploy.yml`) builds/migrates/deploys all three (web is gated). These are the
human/credential/DNS steps the code can't do.

## 1. Telegram (BotFather)
- [ ] Create the bot via @BotFather → copy the **bot token**.
- [ ] Get your **numeric chat id** (message @userinfobot).
- [ ] Invent a **webhook secret** (≥16 chars, random).

## 2. GitHub Actions config (repo → Settings → Secrets and variables → Actions, "prod" environment)
**Secrets:**
- [ ] `PROD_DATABASE_URL` — Neon connection string (the `cool-night` one).
- [ ] `PROD_OPENROUTER_API_KEY` — **rotate first** (the current key has been pasted in chat).
- [ ] `PROD_API_SHARED_SECRET` — random; the bearer the API + web + bot share.
- [ ] `PROD_TELEGRAM_BOT_TOKEN`, `PROD_TELEGRAM_WEBHOOK_SECRET`, `PROD_OWNER_TELEGRAM_CHAT_ID` — from step 1.
- [ ] `PROD_PULUMI_CONFIG_PASSPHRASE` — passphrase for the Pulumi secrets.

**Variables:**
- [ ] `PROD_PROJECT_ID` = `post-anki`, `PROD_REGION` = `europe-west1`.
- [ ] `PROD_REGISTRY` = `europe-west1-docker.pkg.dev/post-anki/post-anki`.
- [ ] `PROD_WIF_PROVIDER`, `PROD_CI_SA_EMAIL` — from `docs/ci-cd/gcp-setup.md` (WIF pool + CI SA).
- [ ] `PROD_API_DOMAIN` = `api.postanki.ilya.online`, `PROD_BOT_DOMAIN` = `bot.postanki.ilya.online`, `PROD_APP_DOMAIN` = `postanki.ilya.online`.
- [ ] `PROD_OPENROUTER_MODEL` (optional) = `openrouter/openai/gpt-4o-mini`.
- [ ] `PROD_WEB_ENABLED` — **leave unset for now**; set to `true` after step 4.

## 3. Pulumi stack config (prod)
- [ ] `pulumi config set projectId post-anki`
- [ ] `pulumi config set --secret telegramWebhookSecret <same as PROD_TELEGRAM_WEBHOOK_SECRET>` — the scheduler sends it as the bearer the bot's `/push` checks. **Must equal** the bot's webhook secret.
- [ ] (optional overrides) `region`, `domain`, `botDomain`, `apiDomain`, `dailyPushSchedule` (default `0 8 * * *`), `dailyPushTimeZone` (default `Europe/Warsaw`).

## 4. Web app Dockerfile (FE build knowledge — needed before web deploys)
- [ ] Create `apps/web/Dockerfile` (root build context; the web imports `@post-anki/shared`).
  TanStack Start: `vite build` → serve the Nitro output (`node .output/server/index.mjs`) listening on `PORT` (Cloud Run sends 8080). Confirm the exact output path/start command for the installed `@tanstack/react-start` version.
- [ ] Confirm the web reads `API_BASE_URL` at runtime (server-side BFF) — the deploy job passes it as both a build arg and an env var.
- [ ] Once it builds locally (`docker build -f apps/web/Dockerfile .`), set GH var `PROD_WEB_ENABLED=true` to switch the `deploy-web` job on.

## 5. First deploy
- [ ] Ensure the Neon DB is reachable from CI (it is — Neon is public).
- [ ] Push to `main` (or run the `deploy` workflow manually). Order: test → infra (`pulumi up`) → deploy bot + api (web only if enabled). Migrations run in CI (`db:migrate:bot`, api `db:migrate`).

## 6. DNS (after the first `pulumi up`)
- [ ] `pulumi stack output` shows `webDomainMappingRecords`, `botDomainMappingRecords`, `apiDomainMappingRecords`. Add the shown CNAME/A records at the `ilya.online` DNS host for: `postanki`, `bot.postanki`, `api.postanki`.
- [ ] Wait for the Cloud Run managed certs to go green (can take ~15–60 min).

## 7. Telegram webhook (after the bot is deployed + `bot.` DNS is live)
- [ ] Point Telegram at the bot:
  `TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… OWNER_TELEGRAM_CHAT_ID=… API_BASE_URL=https://api.postanki.ilya.online DATABASE_URL=… npm run set-webhook -w @post-anki/bot https://bot.postanki.ilya.online/telegram`
  (loadEnv validates the full bot env, hence the extra vars on the one-off.)
- [ ] Send `/today` to the bot → you should get today's question; reply to answer.

## 8. Verify the loop
- [ ] Web: open `https://postanki.ilya.online`, create a subject + curriculum, confirm, probe.
- [ ] Daily push: trigger the scheduler once (`gcloud scheduler jobs run post-anki-daily-push --location europe-west1`) → expect a Telegram message.

## Notes / risks
- **Billing cap:** the GCP account is at 5/5 projects (DECISIONS) — everything lives in the single `post-anki` project; no `post-anki-dev` without freeing a slot.
- **Bot moved to a subdomain:** it used to map the root domain; web now owns the root, bot is `bot.postanki.ilya.online`. No existing webhook to migrate (bot was never live).
- **Scheduler now hits the bot, not the API.** The API's `GET /daily-push` is still used by the web app (pull); the bot's `POST /push` is the Telegram delivery path.
