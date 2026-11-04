---
type: plan
branch: learn-from-doc-site
task: Deploy the post-anki API (prod only) on AWS Fargate Spot as cheaply as possible
state: confirmed
updated: 2026-10-25
---
# Plan: post-anki API on Fargate Spot

This builds the infrastructure code, owner scripts and runbook that put only the post-anki API on one Fargate Spot task in us-east-1, for about $6 a month. The one idea it hinges on: no load balancer; the task carries its own https front door (Caddy, certificate kept on EFS), and a small Lambda keeps `api.postanki.ilya.online` pointed at whichever task is running. Deliberate non-changes: no app code change, no schema change (Neon gets the existing migrations 0104-0112 from the owner), no live sync, web, bot or dev environment in AWS, and the existing ALB/Electric/Lambda code stays in the repo behind flags that default to off.

**Legend:** ➕ add · ✏️ change · ➖ remove

## 1. Database
| | Target | Change | Why |
|---|---|---|---|
| ✏️ | Neon free project (existing) | Owner applies migrations 0104-0112 with `migrate-neon.sh` (labelled backup first, `ALLOW_REMOTE_DB_MIGRATE=1`) | API code, spend guard and vector columns need them |
| — | Schema | No new migration | Hosting-only change |

Read-only `db-status.sh` first: pending tags, pgvector version (needs >= 0.7.0 for `halfvec`), size vs 0.5 GB. Neon sleeps after 5 idle minutes because the pool drops idle connections after 10 s and nothing polls.

## 2. Permissions
| Who | Can do |
|---|---|
| ➕ Task execution role (existing role reused) | Pull from ECR, write logs, `ssm:GetParameters` on `/post-anki/prod/{DATABASE_URL,OPENROUTER_API_KEY,API_SHARED_SECRET}` |
| ➕ Task role | None (the API makes no AWS calls) |
| ➕ Address watcher role | `ecs:ListTasks`/`ecs:DescribeTasks` on the service, `ec2:DescribeNetworkInterfaces`, `route53:ChangeResourceRecordSets` limited to `api.postanki.ilya.online`, `route53:ListResourceRecordSets`, its own logs |
| ✏️ API callers | Phone uses a per-device hashed token; `API_SHARED_SECRET` always set so nothing is open |

## 3. Business rules
- `resolveSpotApiSettings`: capacity `spot` (default) or `ondemand`; only Fargate-valid cpu/memory pairs; ARM64; image tag required; LLM cap 0.5/day default; log retention 7; `manageApiRecord`, `deployAlbServices`, `deployLambdaApi` default false.
- `buildTaskContainers`: API never publishes a port to the internet; secrets only by ARN; no Electric URL, no durable flags; Caddy on 80/443 proxies to `localhost:8030`, stores certificates in `/data` (EFS), starts after the API is healthy, stop timeout 120 s.
- `pickDnsTarget`: newest healthy task wins, else newest running; no write when the record already matches; leave the record alone when nothing runs.
- `evaluateSmoke`: https health ok, http redirects, certificate matches the name, unauthenticated data call refused, token call returns 200.
- `compareMigrationState` / `checkVectorVersion` / `checkNeonFit`: deploy refuses when the database is behind; vector extension must be >= 0.7.0; warn above 80% of 0.5 GB.

## 4. Services (AWS resources)
| | File | What it does |
|---|---|---|
| ➕ | `infra-aws/shared.ts` | VPC/subnet/zone lookups, cluster (now with FARGATE + FARGATE_SPOT capacity providers), execution role; moved from `index.ts` with unchanged names |
| ➕ | `infra-aws/alb-services.ts` | Existing ALB, cert, Electric, Cloud Map, api/web/bot services and Pulumi-secret SSM params, moved verbatim, only when `deployAlbServices` |
| ➕ | `infra-aws/spot-api/spot-api.ts` | ECR repo (keep 5), task SG 80/443, log groups 7 days, ARM64 task 256/512 with EFS volume, service desired 1, capacity strategy, min 100 / max 200, circuit breaker with rollback, public IP |
| ➕ | `infra-aws/spot-api/cert-storage.ts` | Encrypted EFS, mount targets, NFS SG from the task SG only, access point |
| ➕ | `infra-aws/spot-api/dns-updater.ts` | Lambda (arm64, 128 MB, concurrency 1), EventBridge rule on task state changes, 5-minute schedule, A record TTL 60 with `ignoreChanges` on its value, created only when `manageApiRecord` |
| ➕ | `infra-aws/spot-api/dns-updater.handler.ts` | Lists tasks, reads public IPs, calls `pickDnsTarget`, UPSERTs; idempotent |
| ➕ | `infra-aws/spot-api/budget.ts` | $10 monthly cost budget, email at 80% actual and 100% forecast |
| ✏️ | `infra-aws/index.ts` | Thin composition with flags; Spot API exports |
| — | `infra-aws/lambda-api.ts` | Unchanged; called only when `deployLambdaApi` |

## 5. Owner scripts
| | File | What it does |
|---|---|---|
| ➕ | `infra-aws/scripts/lib.sh` | Shared helpers: no `set -x`, never sources env files, hidden prompt, typed confirmation, stack outputs |
| ➕ | `infra-aws/scripts/preflight.sh` | Local tool, AWS identity (read-only), buildx arm64 and clean-tree checks |
| ➕ | `infra-aws/scripts/put-secrets.sh` | Hidden prompts, writes the three SecureString parameters, value never in argv; `--dry-run` |
| ➕ | `infra-aws/scripts/db-status.sh` + `db-status.ts` | Read-only status through a `postgres:<major>` container |
| ➕ | `infra-aws/scripts/migration-state.ts` (+ test) | Migration, vector and size derivers |
| ➕ | `infra-aws/scripts/backup-neon.sh` | `pg_dump -Fc` to `~/post-anki-backups`, keep last 8 plus labelled |
| ➕ | `infra-aws/scripts/migrate-neon.sh` | Labelled backup, typed `prod`, existing migrate command, then status |
| ➕ | `infra-aws/scripts/deploy-api.sh` | Refuses dirty tree or behind database; build-and-push, set image tag, `pulumi up`, smoke |
| ➕ | `infra-aws/scripts/rollback-api.sh` | Tag must exist in ECR; typed confirm; set tag, `pulumi up`, smoke |
| ➕ | `infra-aws/scripts/smoke.sh` + `smoke-checks.ts` (+ test) | Live checks and verdict |
| ➕ | `infra-aws/scripts/mint-token.sh` / `revoke-token.sh` | Per-device token create (shown once) and revoke |
| ✏️ | `infra-aws/scripts/build-and-push.sh` | arm64, git-sha tags, no forced redeploy |
| ➕ | `infra-aws/vitest.config.ts`, `infra-aws/tsconfig.handler.json` | Test runner config; watcher build to `dist-dns-updater/` |

## 6. Validation
| Schema | Fields |
|---|---|
| Spot API settings (Zod) | `apiImageTag`, `apiCapacity`, `apiCpu`, `apiMemoryMb`, `apiLlmDailyBudgetUsd`, `apiHostname`, `apiSsmPrefix`, `manageApiRecord`, `budgetAlertEmail`, `budgetMonthlyUsd`, `deployAlbServices`, `deployLambdaApi` |

## 7. API endpoints
No endpoint changes. The API is served at `https://api.postanki.ilya.online`; `/_healthz` stays unauthenticated; the Electric shape proxy errors because live sync is off (the phone does not use it).

## 8. Background jobs
- ➕ Address watcher: triggers on ECS task state change events for this service and every 5 minutes; reads current state each run (no event ordering assumptions); reserved concurrency 1; free tier.
- API in-process AI jobs keep running in-process; a Spot interruption loses whatever was in flight.

## 9. Tests
- Deriver suites under `infra-aws/spot-api/*.test.ts` and `infra-aws/scripts/*.test.ts`, run with `npx vitest run --root infra-aws`: settings rejection and defaults, container safety rules (no public API port, no secret values), DNS target choice across deploy/interruption/empty cases, smoke verdicts, migration and storage-fit checks.
- `npx tsc --noEmit` in `infra-aws`; `bash -n`/`shellcheck` on scripts; local arm64 image build; local Caddy reverse-proxy with internal certificates.

## 10. Docs
- ➕ `docs/ci-cd/fargate-spot-runbook.md`: manual steps with costs, cutover, phone setup, tokens, backups, rollback, capacity switch, teardown.
- ➕ `docs/architecture/hosting/fargate-spot-api.md`: current shape.
- ✏️ `docs/architecture/paid-services.md`: AWS rows and cost link.
- ✏️ `.dockerignore`: excludes iOS, planning, e2e, infra folders and `Local.xcconfig` from image builds.
- ✏️ `infra-aws/scripts/build-and-push.sh`: arm64, git-sha tags.
- ✏️ `infra-aws/package.json`, `Pulumi.yaml`, `Pulumi.prod.yaml`, `tsconfig.json`: scripts, type-only SDK dev packages (owner approval), documented keys, new modules.
- Owner-only: TECH-STACK entry update.

## 11. After deploy
1. Owner approves the four `[blocked: user]` decisions.
2. `preflight.sh`; `pulumi login file://~/.pulumi-postanki-aws`; `pulumi stack select prod --create`.
3. `put-secrets.sh` (free).
4. `db-status.sh` → `backup-neon.sh pre-0104` → `migrate-neon.sh` (free).
5. Set `budgetAlertEmail`; `deploy-api.sh` (first build, push, `pulumi up`): from here ~$6.00/month.
6. Delete the hand-made `api.postanki` CNAME (one documented `aws route53 change-resource-record-sets` call); `pulumi config set manageApiRecord true`; `pulumi up`.
7. Wait for the certificate; `smoke.sh`; `mint-token.sh "Ilya's iPhone"`; enter the token in the phone; phone check.
8. Weekly `backup-neon.sh`; on a long no-capacity outage `pulumi config set apiCapacity ondemand` + `pulumi up` (~$11/month while on).

## Out of scope
- Any deploy, AWS/Neon write, DNS change or secret entry by the implementer.
- App code changes, including graceful SIGTERM draining.
- Live sync, web, bot, Inngest, DBOS, GCP Cloud Scheduler jobs, dev in AWS.
- GCP shutdown and the push-to-`main` pipeline.
- IPv6-only variant; uptime monitoring beyond smoke, health checks and the budget alert.
