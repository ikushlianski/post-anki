---
type: todo
branch: learn-from-doc-site
task: Deploy the post-anki API (prod only) on AWS Fargate Spot as cheaply as possible
state: open
updated: 2026-10-25
---
# Todo: post-anki API on Fargate Spot

Contract: `spec.md` (Facts, Derivers, Decisions, Files). Each aspect owns its files exclusively; never edit a file another aspect owns. Waves: A1 first; A2 and A3 in parallel after A1 (A2 calls A3's export with the signature fixed in A3's notes); A4 after A2; A5 last.

Hard rules for every aspect:
- Spend nothing and deploy nothing. Never run `pulumi up`, `pulumi preview`, `pulumi refresh`, `pulumi stack init`, `pulumi login` to a cloud backend, any `aws` subcommand, or anything that touches Neon or DNS.
- Never read, print or copy `.env`, `.env.*`, `apps/api/.env*` or `apps/ios/Local.xcconfig`; scripts never source them and never echo secret values.
- Nothing under `apps/`, `infra/`, `.github/` or `infra-aws/lambda-api.ts` changes.
- Local validation only: `npx vitest run --root infra-aws`, `npx tsc --noEmit` in `infra-aws`, `bash -n` and `shellcheck` (when installed) on scripts, a local `docker buildx build --platform linux/arm64` of the API image, and `caddy reverse-proxy` against a local API with internal certificates.

## Decisions to make
- [blocked: user] Approve the design: one Spot API container with an in-container certificate front door, about $6 a month. Recommended: approve.
- [blocked: user] Approve three AWS SDK packages as type-only dev tools for the address watcher. Recommended: approve; the watcher's coding task waits on this.
- [blocked: user] Approve deleting the hand-made GCP record for the API name once, by hand. Recommended: approve; Route 53 cannot hold the new record next to it.
- [blocked: user] Approve the TECH-STACK update to Pulumi plus AWS for the post-anki API, with Caddy. Recommended: approve; the owner edits that file.

## To review / clarify
- Keep Neon's existing data (default) or copy the newer local data into Neon. The default keeps Neon and only adds the missing schema changes.
- This plan and the Hetzner plan both edit the cost inventory and the Docker ignore list. Implement only the plan the owner picks.
- Confirm the daily AI cap of $0.50 for prod.
- Pushing to main still deploys GCP and migrates the same Neon database. Decide whether to pause that pipeline before cutover.

## Aspect A1 — Derivers

**Goal:** the pure rules the infrastructure, the address watcher and the owner scripts rely on exist and are tested in business language.

**Criteria:**
- `resolveSpotApiSettings` rejects a missing image tag, a cpu/memory pair Fargate does not offer, and an unknown capacity; defaults match `spec.md` (Spot, ARM64, 256/512, cap 0.5, retention 7, old parts off, record off).
- `buildTaskContainers` returns an API container with no internet-facing port, secrets only as ARNs, no Electric URL and no durable flags, and a Caddy container on 80/443 with `/data` mounted, starting after the API is healthy.
- `pickDnsTarget` picks the newest healthy task, falls back to the newest running one, returns `unchanged` when the record already matches, and `keep` when nothing runs.
- `evaluateSmoke` fails on: health not ok, http not redirecting, wrong certificate name, unauthenticated data call not refused, token data call not 200.
- `compareMigrationState`, `checkVectorVersion` (needs >= 0.7.0) and `checkNeonFit` (warn above 80% of 0.5 GB) report in plain words.
- Test names state the guarantee; `npx vitest run --root infra-aws` passes.

**Coding tasks:**
- [ ] Write tests, then the settings resolver with plain-word errors.
- [ ] Write tests, then the container definitions builder.
- [ ] Write tests, then the DNS target picker.
- [ ] Write tests, then the smoke verdict.
- [ ] Write tests, then the database status checks.

**Notes:**
- Owns `infra-aws/spot-api/spot-api-settings.ts`, `infra-aws/spot-api/spot-api-settings.test.ts`, `infra-aws/spot-api/task-containers.ts`, `infra-aws/spot-api/task-containers.test.ts`, `infra-aws/spot-api/pick-dns-target.ts`, `infra-aws/spot-api/pick-dns-target.test.ts`, `infra-aws/scripts/smoke-checks.ts`, `infra-aws/scripts/smoke-checks.test.ts`, `infra-aws/scripts/migration-state.ts`, `infra-aws/scripts/migration-state.test.ts`, `infra-aws/vitest.config.ts`.
- Depends on none.
- Zod for config parsing, no `any`. Derivers take plain data, never Pulumi outputs. Migration journal: `apps/api/src/db/migrations/meta/_journal.json` (read only).

## Aspect A2 — Stack split and Spot API resources

**Goal:** a default infrastructure run would create only the Spot API, its certificate storage and the budget alert, while the old load balancer, services and serverless API stay available behind flags.

**Criteria:**
- `npx tsc --noEmit` in `infra-aws` passes.
- Every moved resource keeps its exact Pulumi name and arguments; secrets are read only when the old-services flag is on.
- Service: one task, capacity from settings, minimum healthy 100 / maximum 200, circuit breaker with rollback, public IP on, ARM64, EFS volume.
- Task security group opens only 80 and 443; EFS accepts 2049 only from the task group; log groups keep 7 days; ECR keeps the last 5 images.
- SSM parameters are referenced by name only; no Pulumi secret is required by default.
- Budget: monthly $10 cost budget with email at 80% actual and 100% forecast.
- Pulumi config file documents every key and the local file backend login, with no secret values.

**Coding tasks:**
- [ ] Move shared lookups, cluster and execution role into a shared module without renaming anything.
- [ ] Move the load balancer, live sync and three services into a flagged module, unchanged.
- [ ] Add both capacity providers to the cluster.
- [ ] Add the Spot API repository, security group, logs, task definition and service.
- [ ] Add the encrypted certificate file system with its mount targets and access point.
- [ ] Add the monthly budget alert.
- [ ] Rewrite the entry file as a thin composition with flags and outputs.
- [ ] Document the new config keys and the backend login.

**Notes:**
- Owns `infra-aws/index.ts`, `infra-aws/shared.ts`, `infra-aws/alb-services.ts`, `infra-aws/spot-api/spot-api.ts`, `infra-aws/spot-api/cert-storage.ts`, `infra-aws/spot-api/budget.ts`, `infra-aws/Pulumi.yaml`, `infra-aws/Pulumi.prod.yaml`, `infra-aws/tsconfig.json`.
- Depends on A1 (settings and container builder), A3 (`addDnsUpdater` export, called from the entry file).
- Check current `@pulumi/aws` 6.x argument names (capacity provider strategy, runtime platform, EFS volume configuration, budgets) in the Pulumi registry, never from memory. Never run any `pulumi` command except `pulumi version`.

## Aspect A3 — Address watcher

**Goal:** whenever a new API container becomes healthy, and every five minutes, the API name points at the running container.

**Criteria:**
- Handler compiles to ESM with `npm run build:dns-updater` and imports only the runtime's built-in AWS SDK plus `pickDnsTarget`.
- Triggers: ECS task state changes for this cluster and service, plus a five-minute schedule; reserved concurrency 1.
- Permissions: list and describe this service's tasks, describe network interfaces, change only the API record; nothing else.
- The DNS record (TTL 60) is created only when `manageApiRecord` is on, and later infrastructure runs ignore its value.
- Logs state old and new IP; no secret is ever logged.

**Coding tasks:**
- [ ] [blocked: user] Add the three SDK type packages once approved.
- [ ] Write the handler that lists tasks, reads public IPs and updates the record.
- [ ] Add the handler build config and script.
- [ ] Add the function, permissions, event rule, schedule and record.

**Notes:**
- Owns `infra-aws/spot-api/dns-updater.ts`, `infra-aws/spot-api/dns-updater.handler.ts`, `infra-aws/tsconfig.handler.json`, `infra-aws/package.json`, `infra-aws/package-lock.json`.
- Depends on A1 (`pickDnsTarget`).
- Export `addDnsUpdater({ settings, cluster, service, zoneId })` for A2. Verify the ECS task state change event shape and the Route 53 record-name condition key from AWS docs. Lambda ESM packaging needs a `package.json` with `"type": "module"` inside the archive.

## Aspect A4 — Owner scripts

**Goal:** every owner step in the runbook is one script with a safe default that never shows a secret.

**Criteria:**
- `put-secrets.sh --dry-run` lists names only; real mode reads hidden input and never puts a value in argv, history or logs.
- `db-status.sh` runs in a read-only transaction and writes nothing; `migrate-neon.sh` always takes a labelled backup first and needs the typed word `prod`.
- `deploy-api.sh` refuses a dirty tree or a database behind the code; `rollback-api.sh` refuses a tag missing from the registry.
- `mint-token.sh` shows the token once on the terminal only; `revoke-token.sh` needs typed confirmation.
- `build-and-push.sh` builds arm64 images tagged with the git sha.
- All scripts pass `bash -n` and `shellcheck` when installed; none contains a real IP, token or connection string.
- `.dockerignore` gains the lines in `spec.md`, and a local arm64 build of the API image still succeeds.

**Coding tasks:**
- [ ] Write the shared helpers and the preflight check.
- [ ] Write the secrets script with a dry-run mode.
- [ ] Write the database status, backup and migrate scripts.
- [ ] Write the deploy, rollback and smoke scripts.
- [ ] Write the token mint and revoke scripts.
- [ ] Switch image builds to arm64 with git-sha tags.
- [ ] Extend the Docker ignore list and rebuild the API image locally.

**Notes:**
- Owns `infra-aws/scripts/lib.sh`, `preflight.sh`, `put-secrets.sh`, `deploy-api.sh`, `rollback-api.sh`, `smoke.sh`, `db-status.sh`, `db-status.ts`, `backup-neon.sh`, `migrate-neon.sh`, `mint-token.sh`, `revoke-token.sh`, `build-and-push.sh` (all under `infra-aws/scripts/`), and `.dockerignore`.
- Depends on A1 (smoke and migration derivers), A2 (stack output names).
- Test against a local throwaway Postgres only (e2e lane or a scratch container), never `post-anki-dev-db` writes and never Neon. Use a `postgres:<major>` container for client tools; local `pg_dump` 14 is too old.

## Aspect A5 — Runbook and docs

**Goal:** the owner can go from nothing to a working phone with only the runbook, seeing every paid step and its cost.

**Criteria:**
- Runbook section titled exactly "Manual steps (owner runs, costs money)", in the order of `architecture.md` Rollout, each with command and monthly cost.
- Also covers phone setup, token revocation, weekly backup, rollback, capacity switch, DNS back to GCP, and full teardown.
- Cost table matches `spec.md` line by line with sources and Fact/Assumption labels.
- Architecture doc describes the current shape with a Mermaid diagram and no history sentences.
- Cost inventory rows updated as in `spec.md`.

**Coding tasks:**
- [ ] Write the runbook with manual steps and costs.
- [ ] Write the hosting architecture doc.
- [ ] Update the cost inventory rows.

**Notes:**
- Owns `docs/ci-cd/fargate-spot-runbook.md`, `docs/architecture/hosting/fargate-spot-api.md`, `docs/architecture/paid-services.md`.
- Depends on A2, A3, A4 (final names and flags).

## Manual steps (owner runs, costs money)
- Pick an AWS account and region us-east-1, and log in to the local Pulumi state folder. Free.
- Create the three encrypted secrets with the secrets script. Free.
- Check the Neon database read-only, then take a labelled backup. Free.
- Apply the nine pending schema changes to Neon with the migrate script. Free.
- Set the budget alert email and the image tag, build and push the first image, then run the infrastructure. About $6.00 a month from here ($2.22 Spot, $3.65 public address, about $0.13 storage).
- Delete the hand-made GCP record for the API name, turn the managed record on, and run the infrastructure again. Free.
- Wait for the certificate, run the smoke check, mint the phone's token and enter it in the phone. Free.
- Optional: set a credit limit on the OpenRouter key. Free.

## Post-deploy checks
- Smoke check passes: https, redirect, certificate, refused without token, works with token.
- Phone loads subjects and saves a grade on mobile data and on Wi-Fi.
- Stopping the task by hand brings the API back at the same address within five minutes.
- Neon compute shows as asleep after a quiet spell.
- First budget email arrives as a test or the budget shows in the billing console.

## Resolved
None yet.
