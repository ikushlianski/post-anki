---
type: spec
branch: learn-from-doc-site
task: Deploy the post-anki API (prod only) on AWS Fargate Spot as cheaply as possible
complexity: complex
state: confirmed
updated: 2026-10-25
---
# Spec: post-anki API on Fargate Spot

### Summary
The iPhone app is waiting for a hosted API at its built-in https address. This puts only the API on one discounted, interruptible AWS container (about $6 a month including its public address), with an in-container front door that holds a reused certificate and a small watcher that keeps the DNS name pointed at whichever container is running; the database stays on the existing free Neon project. The implementer writes the infrastructure code, owner scripts and runbook only; the owner runs every step that deploys, migrates or costs money.

### The ask
> Run /plan-ie for: deploy the post-anki API (prod only) on AWS Fargate Spot, as cheaply as possible. [...]
>
> Owner's ask and constraints: the owner wants it on Fargate Spot (about 70% cheaper than on-demand, tasks can be stopped by AWS at any time). Budget for everything is roughly $5-10/month. Prod host `postanki.ilya.online` / API `api.postanki.ilya.online` (the iPhone app defaults to `https://api.postanki.ilya.online`, https only). DNS is Route 53 for ilya.online; two hand-made GCP CNAMEs currently point those names at GCP. The iOS rollout is blocked on this API rollout. Dev stays local (not deployed) unless the plan finds it nearly free.
>
> What you must work out and justify with numbers [...]: 1. What the Fargate Spot task runs [...] Live sync (ElectricSQL) is optional and off by default [...] Database default: the existing Neon project (read-only so far; migrations 0104-0112 are NOT applied there; applying them is an owner-run step). Check that Neon free fits pgvector and the size. 2. Cheapest working HTTPS in front of a Spot task whose public IP changes on every restart. [...] Pick the cheapest that is robust enough, and say what the owner sees during a Spot interruption (downtime length) and how the phone app copes. 3. Reuse: the repo already has AWS infrastructure code [...] say what exists, what is reusable, what must change, and what it costs if left deployed as-is. Respect the TECH-STACK source of truth [...] propose rather than silently add dependencies. 4. Secrets (SSM/Secrets Manager costs), logs retention cost, per-device auth tokens [...], LLM spend caps, backups for the Neon DB, and rollback. 5. Total monthly cost line by line, with and without the public IPv4 charge, and a comparison line against the Hetzner plan (about $7/month for prod and dev) and the Lambda option (about $0).
>
> Hard rules: you write plan files only. Nothing is deployed, nothing is rented, no AWS/Neon write, never read .env files or Local.xcconfig, never print secrets. Anything that costs money is an owner-run manual step listed with its cost. Items that need an owner decision with no safe default are marked `[blocked: user]` with the recommended choice.

### Facts this plan rests on
- **Fact:** the iPhone app's built-in address is `https://api.postanki.ilya.online` (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift:12`); Settings rejects plain http except localhost (`apps/ios/Sources/Shared/SettingsScreen.swift:51`). Network failures map to an "offline, try again" message (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/ProgressModels.swift:174-194`). The admin scan call waits up to 300 s (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient+Admin.swift:4`).
- **Fact:** with `API_SHARED_SECRET` unset every request passes (`apps/api/src/api-server.ts:368`); otherwise the shared secret or a hashed per-device token row is accepted (`apps/api/src/api-server.ts:373-392`). Tokens are minted by `apps/api/scripts/create-api-token.ts` (needs `DATABASE_URL`, prints the token once). Token rows exist since migration 0017; revocation is a `revoked_at` timestamp (`apps/api/src/api-token/api-token.repo.test.ts:35-47`).
- **Fact:** `GET /_healthz` answers before auth and without a database query (`apps/api/src/api-server.ts:448`).
- **Fact:** the pool keeps at most 4 connections and closes idle ones after 10 s (`apps/api/src/db/client.ts:31-32`). Neon puts compute to sleep after 5 minutes with no active queries; Free plan cannot disable this (https://neon.com/docs/introduction/compute-lifecycle). No timer or poller runs in the API by default: DBOS launches only when a durable flag is on (`apps/api/src/knowledge-bit/durable-extraction.workflow.ts:127-133`, flags off by default per `apps/api/src/shared/env.ts:57-69`).
- **Fact:** on SIGTERM the API closes the server and exits at once (`apps/api/src/server.ts:22-33`); background work started with `void` in that process is lost.
- **Fact:** the LLM daily cap defaults to $5 (`apps/api/src/shared/env.ts:7`) and is stored in the database (`apps/api/src/shared/spend-guard.ts:2`, table from migration 0108), so it survives restarts.
- **Fact:** the Electric proxy throws when `ELECTRIC_SERVICE_URL` is unset (`apps/api/src/electric/electric-proxy.service.ts:68`); the iPhone app does not use Electric (Hetzner plan Facts).
- **Fact:** `npm run db:migrate -w @post-anki/api` refuses non-local hosts unless `CI` or `ALLOW_REMOTE_DB_MIGRATE=1` (`apps/api/scripts/migrate.ts:18-38`). Pending on Neon: 0104-0112 (owner statement); 0106 enables pgvector, 0109 needs `halfvec` (pgvector >= 0.7.0).
- **Fact:** Neon Free: 100 CU-hours per project per month, 0.5 GB storage per project, 6-hour restore history (https://neon.com/docs/introduction/plans, https://neon.com/docs/introduction/history-window). Neon added pgvector 0.7.0 with `halfvec` in May 2024 (https://neon.com/docs/changelog/2024-05-24); the version installed on this project is unverified. The local dev database is 12 MB (Hetzner plan Facts).
- **Fact:** idle local API process resident memory measured at about 166 MB (`ps`, 2026-10-25, Node 24 on macOS).
- **Fact (existing AWS code, `infra-aws/`, never deployed: no Pulumi workspace for it exists on this Mac):** one stack creates a shared ALB with a wildcard ACM certificate and HTTP->HTTPS redirect (`infra-aws/index.ts:84-139`), an ECS cluster (`:64`), a Cloud Map private namespace for Electric (`:68-80`), one execution role (`:143-159`), seven SSM parameters whose values come from Pulumi secrets (`:163-209`), an on-demand Electric service (`:219-261`), a helper creating per-app SG, ECR repo, 14-day log group, target group, listener rule, Route 53 alias and on-demand Fargate service (`:269-361`), api/web/bot services (`:367-427`), and the Lambda API with function URL (`:431`, `infra-aws/lambda-api.ts`). `Pulumi.prod.yaml` requires seven secrets including three Telegram ones. `infra-aws/scripts/build-and-push.sh` builds x86 images tagged `latest` and forces a redeploy.
- **Fact:** `.github/workflows/deploy.yml` deploys GCP and migrates the database in `PROD_DATABASE_URL` on every push to `main`.
- **Fact:** the TECH-STACK entry lists post-anki on "Pulumi + GCP" (`~/webdata/ilya-projects/ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md:408-410`).

### HTTPS front-door comparison (prices checked 2026-10-25)
| Option | Extra monthly cost | Works with a changing IP | Request time limit | Verdict |
|---|---|---|---|---|
| ALB (existing code) | ~$16.43 + LCU + its own public IPv4s | Yes | none practical | Over budget. Fact: $0.0225/h, https://www.cloudforecast.io/blog/aws-elb-pricing-optimization-guide/ |
| CloudFront in front of the task | $0 (1 TB / 10M requests free) | Needs an origin DNS name kept current anyway | 30 s default, 60 s without a quota request, 180 s max (https://www.repost.aws/knowledge-center/cloudfront-custom-origin-response) | Breaks the 300 s admin scan; the origin hop is plain http unless the task also holds a certificate. Rejected |
| API Gateway HTTP API + VPC link + Cloud Map | ~$0.01-0.60 ($1.00 per million requests) | Yes, ECS keeps Cloud Map current | 30 s max (https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html) | Breaks long AI calls and the admin scan. Rejected |
| Lambda function URL as proxy | $0, plus CloudFront for the custom name | Needs DNS kept current | CloudFront limit applies | Two hops, same timeout problem. Rejected |
| Cloud Map public DNS | ~$0.50 | ECS registers private IPs only (Assumption) | n/a | Not reachable from the phone. Rejected |
| **Caddy in the task + Let's Encrypt, certificate on EFS, Route 53 record moved by an event-driven Lambda** | ~$0.01 (EFS a few KB) | Yes, watcher moves the record | none | **Chosen.** Only option with no request time limit, end-to-end TLS and ~$0 extra |

Let's Encrypt allows 5 certificates per exact name set per 7 days with no override (https://letsencrypt.org/docs/rate-limits/), so certificate storage must survive restarts; EFS is the storage.

### What the Spot task runs
- API container only, plus the Caddy front door. Live sync is out: Electric holds a permanent replication connection that keeps Neon awake (~182 CU-h/month at 0.25 CU against 100 free; about $19/month on Launch, per the Hetzner plan's sourced figure). No cheap way exists while Neon is the database. The web app, bot, Inngest and DBOS stay off.
- Size: 0.25 vCPU / 0.5 GB, ARM64 (Fact: ECS supports Graviton on Fargate Spot since Sep 2024, https://aws.amazon.com/about-aws/whats-new/2024/09/amazon-ecs-graviton-based-spot-compute-fargate/). 1 GB is one setting away (+$0.40/month on Spot) if memory runs short.

### Interruption behaviour
- **Fact:** Fargate Spot sends a two-minute warning as an EventBridge event and a SIGTERM; a service scheduler then tries to start a replacement on Spot if capacity exists; a one-task service is down until capacity returns; Fargate never substitutes on-demand capacity (https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-capacity-providers.html).
- **Assumption:** typical gap two to four minutes: the API exits at the SIGTERM; the replacement needs about 1-2 minutes to start and pull a few hundred MB image; the watcher moves the record within seconds of the new task turning healthy (five-minute schedule as backstop); phones re-resolve within the 60 s record lifetime.
- Phone: requests fail with a network error and the app shows its offline message; pull to refresh works afterwards. A phone that still resolves the old IP cannot leak its token: the TLS handshake fails before any header is sent, because no other party holds this certificate.
- No capacity for a long time: the owner sets `apiCapacity` to `ondemand` and runs the infrastructure update (on-demand ARM costs ~$7.21/month instead of ~$2.22).

### Monthly cost (us-east-1, 730 h)
| Line | Cost / month | Label / source |
|---|---|---|
| Fargate Spot ARM, 0.25 vCPU x $0.00995/h + 0.5 GB x $0.0010942/h | $2.22 | Fact (third-party, Spot prices move): https://cloudchipr.com/blog/aws-fargate-pricing |
| Public IPv4 on the task, $0.005/h | $3.65 | Fact: https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights |
| EFS Standard, a few KB at $0.30/GB-month | ~$0.01 | Fact (third-party): https://www.factualminds.com/blog/amazon-efs-pricing-throughput-modes-storage-classes/ |
| ECR, ~1.2 GB (3 images x ~0.4 GB, Assumption) at $0.10/GB-month | ~$0.12 | Fact: https://aws.amazon.com/ecr/pricing ; image size Assumption |
| CloudWatch Logs, < 1 GB/month, 7-day retention | $0 | Fact (third-party): $0.50/GB ingestion, 5 GB free, https://cloudchipr.com/blog/cloudwatch-pricing |
| SSM Parameter Store standard SecureString (3 params) | $0 | Fact: https://aws.amazon.com/blogs/security/how-to-choose-the-right-aws-service-for-managing-secrets-and-configurations ; Secrets Manager would be $0.40/secret = $1.20, not used |
| Watcher Lambda (~9,000 runs) + EventBridge events + schedule | $0 | Fact: Lambda 1M requests / 400k GB-s free (Hetzner plan source https://aws.amazon.com/lambda/pricing/); AWS service events free (https://aws.amazon.com/eventbridge/pricing/); schedule free tier is an Assumption |
| Route 53 queries | < $0.01 | Fact: $0.40 per million, https://aws.amazon.com/route53/pricing/ |
| Route 53 zone `ilya.online` (already paid, shared) | $0 extra ($0.50 shared) | Assumption (Hetzner plan) |
| Data transfer out, < 1 GB | $0 | Fact: 100 GB/month free, https://aws.amazon.com/blogs/aws/aws-free-tier-data-transfer-expansion-100-gb-from-regions-and-1-tb-from-amazon-cloudfront-per-month |
| AWS Budgets alert | $0 | Fact: https://aws.amazon.com/aws-cost-management/aws-budgets/pricing |
| Neon Free | $0 | Fact: https://neon.com/docs/introduction/plans |
| **Total with public IPv4** | **~$6.00** | |
| **Total without the IPv4 charge** (only if covered by credits/free tier, Assumption) | **~$2.35** | |
| Same on regular capacity (no-Spot fallback month) | ~$11.00 | Fact: ARM on-demand $0.03238/vCPU-h, $0.00356/GB-h, https://www.vantage.sh/blog/fargate-pricing |
| x86 Spot instead of ARM | +$0.55 | Fact (third-party): $0.01244/vCPU-h, $0.00137/GB-h, cloudchipr |
| OpenRouter AI usage (not hosting) | ≤ $15 worst case | Daily cap $0.50 x 30 |

Comparison: Hetzner plan ~$6.90/month excl. VAT (~$8.80 with VAT) for prod and dev with Postgres, live sync and web on one server; this plan ~$6.00 for prod API only (no dev, no live sync, no web), ~$2.35 if the IPv4 charge is covered; Lambda option ~$0 but needs the background-job rework and a CloudFront front with its 60 s limit.

**Cost of `infra-aws` if deployed as-is** (Assumption, arithmetic from the facts above): ALB $16.43 + LCU ~$1; four on-demand x86 services (api, web, bot, Electric) at 0.25 vCPU / 0.5 GB, 4 x $9.01 = $36.04; public IPv4 for four tasks plus at least two for the ALB, 6 x $3.65 = $21.90; Cloud Map private zone ~$0.50; ECR cents. About **$76/month**, plus Electric keeping Neon awake: the free 100 CU-hours run out in about 17 days and compute stops for the rest of the month, or ~$19/month on Launch. It also cannot run today without the seven Pulumi secrets.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `resolveSpotApiSettings` (`infra-aws/spot-api/spot-api-settings.ts`) | raw stack config values | validated settings: capacity `spot`/`ondemand`, cpu/memory pair (Fargate-valid only), arch `ARM64`, image tag (required, git sha shape), hostname, log retention 7, LLM daily cap (default 0.5), SSM prefix, `manageApiRecord`, budget email and limit; feature flags `deployAlbServices` and `deployLambdaApi` default false; Zod errors in plain words | SCENARIO 4, SCENARIO 9, SCENARIO 10 |
| `buildTaskContainers` (`infra-aws/spot-api/task-containers.ts`) | settings, secret parameter ARNs, log group names, region | two container definitions: API (no port published to the internet, health check via Node fetch of `/_healthz`, secrets by ARN only, env `PORT=8030`, `WEB_ORIGIN`, `LLM_DAILY_BUDGET_USD`, `LLM_MODE=real`, `ELECTRIC_AUTH_MODE=none`, no Electric URL, no durable flags) and Caddy (`caddy reverse-proxy --from <hostname> --to localhost:8030`, ports 80/443, `/data` on EFS, starts after API is healthy, stopTimeout 120) | SCENARIO 1, SCENARIO 2, SCENARIO 5, SCENARIO 8 |
| `pickDnsTarget` (`infra-aws/spot-api/pick-dns-target.ts`) | service tasks (status, health, startedAt, public IP), current record value | `upsert <ip>` for the newest running healthy task (newest running if none healthy yet), `unchanged`, or `keep` when nothing runs | SCENARIO 3, SCENARIO 6 |
| `evaluateSmoke` (`infra-aws/scripts/smoke-checks.ts`) | collected results: https health, http redirect, certificate name and issuer, unauthenticated data call, token data call | named pass/fail list with plain reasons and an overall verdict | SCENARIO 1, SCENARIO 2, SCENARIO 5, SCENARIO 6 |
| `compareMigrationState`, `checkVectorVersion`, `checkNeonFit` (`infra-aws/scripts/migration-state.ts`) | journal tags, applied count and last created_at; extension version or null; database size bytes | `matches` / `behind` (pending tags) / `ahead` / `empty`; ok / too old / missing (needs >= 0.7.0); ok / warn above 80% of 0.5 GB / over | SCENARIO 7, SCENARIO 9 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | None | None | `infra-aws/spot-api/task-containers.ts`, `infra-aws/spot-api/spot-api.ts`, `infra-aws/scripts/smoke.sh`, `infra-aws/scripts/smoke-checks.ts`, `infra-aws/scripts/mint-token.sh` |
| SCENARIO 2 | None | None | `infra-aws/scripts/put-secrets.sh`, `infra-aws/scripts/revoke-token.sh`, `infra-aws/scripts/smoke-checks.ts` |
| SCENARIO 3 | None | None | `infra-aws/spot-api/pick-dns-target.ts`, `infra-aws/spot-api/dns-updater.ts`, `infra-aws/spot-api/dns-updater.handler.ts` |
| SCENARIO 4 | None | None | `infra-aws/spot-api/spot-api-settings.ts`, `infra-aws/spot-api/spot-api.ts`, `infra-aws/shared.ts` |
| SCENARIO 5 | None | None | `infra-aws/spot-api/cert-storage.ts`, `infra-aws/spot-api/task-containers.ts` |
| SCENARIO 6 | None | None | `infra-aws/scripts/deploy-api.sh`, `infra-aws/scripts/rollback-api.sh`, `infra-aws/scripts/build-and-push.sh`, `infra-aws/spot-api/spot-api.ts` |
| SCENARIO 7 | None | None | `infra-aws/scripts/db-status.sh`, `infra-aws/scripts/db-status.ts`, `infra-aws/scripts/migration-state.ts`, `infra-aws/scripts/backup-neon.sh`, `infra-aws/scripts/migrate-neon.sh` |
| SCENARIO 8 | None | None | `infra-aws/scripts/put-secrets.sh`, `infra-aws/scripts/lib.sh`, `infra-aws/spot-api/task-containers.ts` |
| SCENARIO 9 | None | None | `infra-aws/spot-api/budget.ts`, `infra-aws/spot-api/spot-api-settings.ts`, `infra-aws/spot-api/spot-api.ts` |
| SCENARIO 10 | None | None | `infra-aws/index.ts`, `infra-aws/shared.ts`, `infra-aws/alb-services.ts`, `infra-aws/Pulumi.prod.yaml` |
| SCENARIO 11 | None | None | `infra-aws/spot-api/dns-updater.ts`, `docs/ci-cd/fargate-spot-runbook.md` |
| SCENARIO 12 | None | None | `docs/ci-cd/fargate-spot-runbook.md`, `docs/architecture/hosting/fargate-spot-api.md`, `docs/architecture/paid-services.md` |

### Files to create
```
infra-aws/
  shared.ts                       default VPC + public subnets + Route 53 zone lookups, ECS cluster with FARGATE and FARGATE_SPOT capacity providers, shared execution role (moved out of index.ts, same resource names so nothing is replaced)
  alb-services.ts                 addAlbServices(): the existing ALB, cert, SSM-from-Pulumi-secrets, Electric, Cloud Map, helper and api/web/bot services moved verbatim from index.ts; secrets read only inside this function
  vitest.config.ts                minimal node config so `npx vitest run --root infra-aws` runs the deriver tests
  tsconfig.handler.json           compiles dns-updater.handler.ts + pick-dns-target.ts to ESM in infra-aws/dist-dns-updater/
  spot-api/
    spot-api-settings.ts          resolveSpotApiSettings deriver (Zod)
    spot-api-settings.test.ts
    task-containers.ts            buildTaskContainers deriver
    task-containers.test.ts
    pick-dns-target.ts            pickDnsTarget deriver
    pick-dns-target.test.ts
    spot-api.ts                   addSpotApi(): ECR repo (lifecycle keep 5), task SG (80/443 from 0.0.0.0/0 only), log groups (7 days), task definition (ARM64, 256/512, EFS volume), service (desired 1, capacity strategy from settings, min healthy 100 / max 200, circuit breaker with rollback, public IP on), SSM parameter ARNs built from names (no values)
    cert-storage.ts               EFS file system (encrypted), mount target per used subnet, SG allowing 2049 only from the task SG, access point for /data
    dns-updater.ts                Lambda (Node 22, arm64, 128 MB, 30 s, reserved concurrency 1, logs 7 days), IAM (ecs:ListTasks/DescribeTasks on the service, ec2:DescribeNetworkInterfaces, route53:ChangeResourceRecordSets limited to the API name, route53:ListResourceRecordSets), EventBridge rule on ECS Task State Change for this cluster+service, 5-minute schedule, Route 53 A record (TTL 60) created only when manageApiRecord is on, with ignoreChanges on records
    dns-updater.handler.ts        runtime: list tasks, read public IPs, call pickDnsTarget, UPSERT the record; logs IP changes, never secrets
    budget.ts                     AWS Budgets monthly cost budget ($10 default) with email alerts at 80% actual and 100% forecast
  scripts/
    lib.sh                        common: refuses to run with set -x, never sources env files, typed confirmation helper, prompt-hidden helper, stack output reader
    preflight.sh                  local checks: aws identity (read-only `sts get-caller-identity`), pulumi, docker buildx arm64, clean git tree
    put-secrets.sh                prompts hidden for DATABASE_URL, OPENROUTER_API_KEY, API_SHARED_SECRET (generates one when left blank) and writes SecureString parameters under /post-anki/prod/ without the value ever in argv or history; --dry-run lists names only
    deploy-api.sh                 refuses a dirty tree and a database that is behind; build-and-push with the git sha, `pulumi config set apiImageTag`, `pulumi up`, then smoke
    rollback-api.sh               <sha>: checks the image exists in ECR, typed confirm, sets the tag, `pulumi up`, smoke
    smoke.sh                      curl checks against the hostname; token from SMOKE_TOKEN or a hidden prompt; feeds smoke-checks.ts
    smoke-checks.ts               evaluateSmoke deriver + tiny CLI
    smoke-checks.test.ts
    db-status.sh                  read-only transaction via psql in a `postgres:<major>` container; URL from a hidden prompt; JSON to db-status.ts
    db-status.ts                  prints schema level, vector version, size vs free limit, subject count
    migration-state.ts            compareMigrationState, checkVectorVersion, checkNeonFit
    migration-state.test.ts
    backup-neon.sh                [label]: pg_dump -Fc with a client matching the server major, into ~/post-anki-backups (outside the repo), keeps the last 8 plus labelled dumps
    migrate-neon.sh               labelled backup, typed confirm, then ALLOW_REMOTE_DB_MIGRATE=1 npm run db:migrate -w @post-anki/api with DATABASE_URL from a hidden prompt, then db-status
    mint-token.sh                 "<label>": runs create-api-token.ts with DATABASE_URL from a hidden prompt; token shown once on the terminal only
    revoke-token.sh               "<label>": sets revoked_at on the matching active token row after typed confirm
docs/ci-cd/fargate-spot-runbook.md              manual steps with commands and costs, cutover, phone setup, tokens, backups, rollback, capacity switch, teardown
docs/architecture/hosting/fargate-spot-api.md   current-shape doc: diagram, address watcher, certificate storage, secrets, interruption behaviour
```

### Files to modify
```
infra-aws/index.ts            becomes a thin composition: resolveSpotApiSettings, shared resources, addSpotApi + addDnsUpdater + addBudget always; addAlbServices only when deployAlbServices; addLambdaApi only when deployLambdaApi; exports for the Spot API (service name, cluster, repo URL, log group names); existing exports kept inside their flags
  used by: Pulumi entry point (Pulumi.yaml main default)
  tests: none
infra-aws/Pulumi.prod.yaml    document new keys (apiImageTag, apiCapacity, apiCpu, apiMemoryMb, apiLlmDailyBudgetUsd, manageApiRecord false, budgetAlertEmail, budgetMonthlyUsd, deployAlbServices false, deployLambdaApi false); move the seven secret comments under "only when deployAlbServices"; no secret values
  used by: pulumi CLI
  tests: none
infra-aws/Pulumi.yaml         description names the Spot API as the default deployment
infra-aws/tsconfig.json       include the new modules (files list or include glob), keep compiler options
infra-aws/package.json        add scripts `build:dns-updater` and `test`; add devDependencies @aws-sdk/client-ecs, @aws-sdk/client-ec2, @aws-sdk/client-route-53 for types only (runtime uses the SDK built into the Lambda Node runtime) — [blocked: user] approval
  used by: infra-aws only
infra-aws/scripts/build-and-push.sh   api only for the Spot path; `--platform linux/arm64`; tag = git sha (also keeps web/bot behaviour when deployAlbServices is on); no force-new-deployment (Pulumi rolls the service)
.dockerignore                 add apps/ios, .planning, e2e, e2e-local, infra, infra-aws, proof, apps/api/dist-lambda, **/Local.xcconfig; keep every existing line
  used by: apps/api/Dockerfile, apps/web/Dockerfile, apps/bot/Dockerfile builds (repo-root context)
docs/architecture/paid-services.md    AWS row: Spot API live shape and cost table link; ALB/Fargate/Electric rows marked "in code, off by default"; Neon row notes prod API use
```
Nothing under `apps/` changes. `infra/`, `infra-aws/lambda-api.ts` and `.github/workflows/` stay untouched.

### Risk & rollout
- See `architecture.md` "Failure modes" and "Rollout".
- Blast radius: moving code out of `infra-aws/index.ts` must keep every existing resource name, so a later run with `deployAlbServices` on plans no replacement; a `pulumi preview` with defaults must show only Spot API resources.
- Before prod is safe: the three SSM parameters must exist and `API_SHARED_SECRET` must be non-empty, or the API is open to anyone; the smoke check fails on an unauthenticated 200. Migrations 0104-0112 must be on Neon before the first deploy, or the spend guard and newer endpoints fail.
- A push to `main` still deploys GCP and migrates the same Neon database through `.github/workflows/deploy.yml`; until GCP is retired, the owner avoids pushing to `main` or accepts a second API on the same database.
- Rollback: image version (`rollback-api.sh`), database (Neon 6-hour restore or labelled dump), DNS back to GCP while GCP lives, full `pulumi destroy`.

### Documentation changes
- Create `docs/architecture/hosting/fargate-spot-api.md` (domain `hosting`; no `docs/architecture/README.md` taxonomy exists yet, same domain name the Hetzner plan proposes).
- Create `docs/ci-cd/fargate-spot-runbook.md` next to `docs/ci-cd/gcp-setup.md`.
- Update `docs/architecture/paid-services.md` as listed.
- Proposed, owner-only (outside this repo): TECH-STACK post-anki entry becomes "Pulumi + AWS (Fargate Spot API, Caddy front door), Neon"; GCP noted as being retired.

### Decisions made autonomously
- Front door: Caddy in the task with the certificate on EFS and a Route 53 watcher. API Gateway (30 s) and CloudFront (60 s without a quota request) cut off the 300 s admin scan and long AI calls; an ALB breaks the budget.
- Address watcher is an EventBridge-triggered Lambda plus a five-minute schedule, not a script inside the task: the API task gets no AWS permissions, and missed events self-heal.
- Watcher picks the newest healthy task, so during a deploy the name moves only when the new version passes its health check.
- Caddy runs from the official image on ECR Public (`public.ecr.aws/docker/library/caddy`, pinned version) with its `reverse-proxy` subcommand, so no custom image or plugin is needed.
- ARM64 Spot at 0.25 vCPU / 0.5 GB: measured idle memory ~166 MB leaves headroom; ARM is about 20% cheaper; the owner's Mac builds arm64 natively.
- Secrets are SSM SecureString parameters created by the owner's script, referenced by name, so values never enter Pulumi state (the existing Lambda code follows the same rule). Secrets Manager adds $1.20/month for nothing needed here.
- API uses Neon's direct (non-pooled) connection string: one long-lived process with at most 4 connections, no pooler caveats.
- Live sync, web, bot, Inngest and DBOS stay off; durable flags unset so nothing polls Neon.
- Dev stays local: a second Spot task plus its IPv4 is ~$5.90/month, not nearly free.
- LLM daily cap $0.50 in prod (code default $5); owner-adjustable setting. The runbook also suggests an optional credit limit on the OpenRouter key itself (free, owner-run) as a second guard.
- Backups: Neon's 6-hour restore history plus an owner-run weekly `backup-neon.sh` to the Mac and a labelled dump before every migration; no paid backup service.
- Existing ALB/Electric/web/bot code and the Lambda API stay in the repo behind flags that default to off, instead of being deleted.
- Pulumi state on a local file backend (`file://~/.pulumi-postanki-aws`), free; it holds no secret values.
- The hand-made `api.postanki.ilya.online` CNAME is removed once by the owner with one documented command, the same one-time exception the Hetzner plan records; from then on Pulumi owns the record's existence and the watcher owns its value. The web name's CNAME is untouched.
- Data: keep Neon's existing data and migrate it in place (the ask's default); copying local data is listed for the owner to review, not planned.
- ECS deployment circuit breaker with rollback is on, so a version that never turns healthy reverts by itself.
- Subnets: all default-VPC public subnets in AZs that support Fargate, to widen Spot capacity; the implementer checks AZ support from docs rather than memory.
- Grill-plan subagent not dispatched and no interview held: this run has no agent or question tool. Self-grill findings are folded into Risk & rollout, Failure modes and the todo's review list.

### Implementation order
1. Derivers `resolveSpotApiSettings`, `buildTaskContainers`, `pickDnsTarget`, `evaluateSmoke`, `compareMigrationState` + `checkVectorVersion` + `checkNeonFit`: red-green-refactor, covering SCENARIO 1-10.
2. Stack split: `shared.ts`, `alb-services.ts`, thin `index.ts`, Pulumi config docs: SCENARIO 10.
3. Spot API resources: `spot-api.ts`, `cert-storage.ts`, `budget.ts`: SCENARIO 1, 4, 5, 9.
4. Address watcher: `dns-updater.ts`, handler, handler build: SCENARIO 3, 11.
5. Owner scripts and `.dockerignore`: SCENARIO 2, 6, 7, 8.
6. Runbook, architecture doc, paid-services update: SCENARIO 12.

### Scope boundary
- No deploy, no `pulumi up`/`preview` against AWS, no AWS or Neon write, no DNS change, no secret entry: all owner steps.
- No change under `apps/` (including graceful SIGTERM draining that would shorten the interruption gap — cut, not requested).
- Live sync (Electric), web app, Telegram bot, Inngest, DBOS and GCP Cloud Scheduler jobs are not deployed.
- No dev environment in AWS.
- No GCP shutdown and no change to the push-to-`main` pipeline.
- No IPv6-only variant (would drop the $3.65 IPv4 charge but IPv4-only Wi-Fi could not reach the phone's API).
- No uptime monitoring beyond the smoke check, container health checks and the budget alert.
