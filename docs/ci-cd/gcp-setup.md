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

## Remaining steps

### 1. Pulumi stack (run once locally)
```bash
cd infra && npm install
export PULUMI_BACKEND_URL=gs://post-anki-pulumi-state
pulumi stack init prod                       # choose a passphrase -> GitHub secret PROD_PULUMI_CONFIG_PASSPHRASE
pulumi config set projectId post-anki
pulumi config set region europe-west1
pulumi config set domain postanki.ilya.online
pulumi config set gcp:project post-anki
git add infra/Pulumi.prod.yaml && git commit -m "infra: prod stack config"
```

### 2. Drizzle migration (must exist before first deploy)
```bash
npm install
npm run db:generate   # commit generated files under src/db/migrations
```
Without it the `study_profile` table is never created and the bot 500s on the first message (and the Docker build fails copying a missing migrations dir).

### 3. GitHub environment `prod`
Repo → Settings → Environments → `prod`.

Variables: `PROD_PROJECT_ID=post-anki`, `PROD_REGION=europe-west1`, `PROD_REGISTRY` (= `pulumi stack output registryUrl`), `PROD_WIF_PROVIDER` (above), `PROD_CI_SA_EMAIL=github-ci@post-anki.iam.gserviceaccount.com`, `PROD_APP_DOMAIN=postanki.ilya.online`, `PROD_OPENROUTER_MODEL` (optional).

Secrets: `PROD_PULUMI_CONFIG_PASSPHRASE`, `PROD_DATABASE_URL`, `PROD_TELEGRAM_BOT_TOKEN`, `PROD_TELEGRAM_WEBHOOK_SECRET`, `PROD_OWNER_TELEGRAM_CHAT_ID`, `PROD_OPENROUTER_API_KEY`.

### 4. First deploy
`git push origin main` → test → infra (`pulumi up`) → deploy → `/healthz` gate.

### 5. DNS (one-time, after first infra run)
```bash
cd infra && pulumi stack output domainMappingRecords   # -> CNAME target (ghs.googlehosted.com)
```
Add CNAME `postanki` → `ghs.googlehosted.com` in the `ilya.online` zone. Managed cert provisions once DNS resolves (15–60 min).

### 6. Register the Telegram webhook (one-time, after domain resolves)
```bash
npm run set-webhook https://postanki.ilya.online/telegram
```
Green health check ≠ working bot — without this Telegram delivers nothing.

## Teardown
`cd infra && pulumi destroy --stack prod`. State bucket, WIF, and the project are deleted manually.
