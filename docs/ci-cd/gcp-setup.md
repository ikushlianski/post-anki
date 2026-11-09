# GCP setup

Single project `post-anki` (number `690573462691`) holds everything — Pulumi state, registry, Cloud Run, WIF, domain. Collapsed from a bootstrap+prod split because the billing account is at its 5-project cap.

Pulumi owns registry + runtime SA + Cloud Run shell + DomainMapping; `gcloud run deploy` owns image + env vars (`ignoreChanges: template` keeps them from fighting).

## Already provisioned (done)
- Project `post-anki` created, billing linked.
- APIs enabled: serviceusage, storage, iam, iamcredentials, sts, cloudresourcemanager.
- State bucket `gs://post-anki-pulumi-state` (europe-west3, versioning on).
- WIF pool `github` + OIDC provider `github-actions`, condition `assertion.repository=='ikushlianski/post-anki'`.
- CI SA `github-ci@post-anki.iam.gserviceaccount.com`: repo impersonation binding + project `roles/owner`.

WIF provider resource name (GitHub var `PROD_WIF_PROVIDER`):
`projects/690573462691/locations/global/workloadIdentityPools/github/providers/github-actions`

## Pipeline

`.github/workflows/deploy.yml` runs on every push to `main` (and manually, with an optional `pulumi refresh`). `.github/workflows/release.yml` also runs on push to `main` and publishes a `v0.1.<run number>` GitHub release.

| Job | Needs | What it does |
|---|---|---|
| `test` | none | typecheck, unit tests, integration tests against a Postgres service, web-bundle Node built-in check |
| `review-factory-gate` | `test` | dependency-cruiser rules and the no-dynamic-imports check |
| `infra` | `test` | `pulumi up` on stack `prod` (registry, service accounts, Cloud Run shells, scheduler jobs, domain mapping) |
| `deploy` | `test`, `infra`, gate | bot migrations (`db:migrate:bot`), image build, `gcloud run deploy post-anki-bot`, `/_healthz` check |
| `deploy-api` | `test`, `infra`, gate | API migrations (`db:migrate -w @post-anki/api`), image build, `gcloud run deploy post-anki-api`, `/_healthz` check |
| `deploy-web` | `test`, `infra`, `deploy-api`, gate | image build and `gcloud run deploy post-anki-web`, `/login` check; runs only when `PROD_WEB_ENABLED` is `true` |

Each deploy job polls its health path for up to 60 seconds (12 tries, 5 seconds apart). Bot and API serve `/_healthz`; web serves `/login`.

## GitHub environment `prod`

Repo -> Settings -> Environments -> `prod`.

Variables:
- `PROD_PROJECT_ID` = `post-anki`
- `PROD_REGION` = `europe-west1`
- `PROD_REGISTRY` (= `pulumi stack output registryUrl`)
- `PROD_WIF_PROVIDER` (above)
- `PROD_CI_SA_EMAIL` = `github-ci@post-anki.iam.gserviceaccount.com`
- `PROD_OPENROUTER_MODEL` (optional; default `openrouter/google/gemini-2.5-flash`)
- `PROD_WEB_PUBLIC_URL` (optional; default `https://postanki.ilya.online`; sets `BETTER_AUTH_URL` and `WEB_ORIGINS`)
- `PROD_AUTH_EMAIL_FROM`
- `PROD_OWNER_EMAIL` (optional; has a default)
- `PROD_LANGFUSE_HOST` (optional; default `https://cloud.langfuse.com`)
- `PROD_WEB_ENABLED` (`true` turns on `deploy-web`)
- `PROD_ELECTRIC_ENABLED` (`true` wires the Electric service URL into the API)

Secrets:
- `PROD_PULUMI_CONFIG_PASSPHRASE`
- `PROD_DATABASE_URL`
- `PROD_API_SHARED_SECRET` (also stored as the Pulumi secret `apiSharedSecret` by the `infra` job)
- `PROD_TELEGRAM_BOT_TOKEN`, `PROD_TELEGRAM_WEBHOOK_SECRET`, `PROD_OWNER_TELEGRAM_CHAT_ID`
- `PROD_OPENROUTER_API_KEY`
- `PROD_RESEND_API_KEY`, `PROD_BETTER_AUTH_SECRET`
- `PROD_LANGFUSE_PUBLIC_KEY`, `PROD_LANGFUSE_SECRET_KEY`
- `PROD_NOTION_TOKEN`

## One-time bootstrap

### 1. Pulumi stack (run once locally)
```bash
cd infra && npm install
export PULUMI_BACKEND_URL=gs://post-anki-pulumi-state
pulumi stack init prod                       # choose a passphrase -> GitHub secret PROD_PULUMI_CONFIG_PASSPHRASE
pulumi config set projectId post-anki
pulumi config set region europe-west1
pulumi config set domain postanki.ilya.online
pulumi config set gcp:project post-anki
```
Commit `infra/Pulumi.prod.yaml` afterwards.

### 2. Migrations
Migrations are generated per app (`npm run db:generate:api`, `npm run db:generate:bot`), committed, and applied by the deploy jobs. The Docker builds copy the migrations directories, so they must exist in the repo.

### 3. First deploy
Pushing to `main` runs the pipeline above.

### 4. DNS (one-time, after first infra run)
```bash
cd infra && pulumi stack output domainMappingRecords   # -> CNAME target (ghs.googlehosted.com)
```
Add CNAME `postanki` → `ghs.googlehosted.com` in the `ilya.online` zone. Managed cert provisions once DNS resolves (15–60 min).

### 5. Register the Telegram webhook (one-time, after domain resolves)
```bash
npm run set-webhook -w @post-anki/bot -- https://postanki.ilya.online/telegram
```
Green health check ≠ working bot — without this Telegram delivers nothing.

## Teardown
`cd infra && pulumi destroy --stack prod`. State bucket, WIF, and the project are deleted manually.
