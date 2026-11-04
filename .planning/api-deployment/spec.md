---
type: spec
branch: learn-from-doc-site
task: Host post-anki (API, database, live sync, web) for the owner's iPhone app, dev + prod, under $10/month
complexity: complex
state: confirmed
updated: 2026-10-24
---
# Spec: post-anki hosting for the iPhone app

### Summary
The owner's iPhone app needs to reach post-anki from anywhere, in a dev and a prod environment on the owner's domain, for about $5-10 a month covering the API, database, live sync and web app. One small rented server running every service in containers, with automatic certificates, is the only option under $10 that covers all of that. This work writes the server definition, the containers, the owner-run scripts and the runbook; the owner runs every step that costs money or deploys.

### The ask
> Plan the deployment of the main API (apps/api, Node, Postgres with pgvector, Electric sync sidecar, extraction jobs) so that a personal iPhone app (apps/ios, used only by the owner) can reach it from anywhere. [...] HARD STOP: nothing in the plan or its implementation may spend money or run a cloud deploy; the implementer only writes config, scripts and docs and validates them locally [...]. Every paid or deploying step goes into a clearly labelled "Manual steps (owner runs, costs money)" list with exact commands and the estimated monthly cost. [...] compare, with real current prices [...] recommend ONE [...] and the data migration plan from local to the target (read-only on Neon until the owner says; never print or commit secrets [...]). Include auth/token setup for the iOS app, CORS/ATS (https), health check, migrations via the existing migrate script (never push schema directly), and rollback. Split todo.md into independent aspects [...] no file overlap with apps/ios or apps/web; apps/api only if unavoidable. Do not implement.
>
> Addition: targets are two environments on the owner's own domain: dev.postanki.ilya.online (dev) and postanki.ilya.online (prod) [...]. Plan both environments, the DNS/TLS setup for these hostnames, per-env secrets and migration flow, and promotion dev -> prod.
>
> Owner budget: about $5-10 per month TOTAL for everything postanki: API, database, Electric sync, the web app and domain hosting [...]. Choose the cheapest option that fits, and show a line-by-line monthly cost that must stay under $10 (state if it cannot, and the closest fit). Single small VPS [...] running docker compose with Caddy for TLS and the two hostnames, versus Neon free/Launch, versus Lambda: compare with current real prices.

### Facts this plan rests on
- **Fact:** the iPhone app's built-in prod address is `https://api.postanki.ilya.online` (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient.swift:12`); Settings accepts any https address and rejects http except localhost (`apps/ios/Sources/Shared/SettingsScreen.swift:51`); the token sits in the Keychain (`apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/TokenStore.swift:27`). The app does not use Electric outside the spike targets.
- **Fact:** API auth accepts `Bearer <API_SHARED_SECRET>` or a hashed per-device token row; with `API_SHARED_SECRET` unset every request passes (`apps/api/src/api-server.ts:365-392`). Tokens are minted by `apps/api/scripts/create-api-token.ts` into the database it is pointed at.
- **Fact:** `/_healthz` answers `{ok:true}` before auth (`apps/api/src/api-server.ts:448`); `GET /subjects` requires auth (`apps/api/src/router-table.ts:17`, `apps/api/src/api-server.ts:484`).
- **Fact:** requests without an Origin header (native app) skip CORS (`apps/api/src/shared/cors.ts:19`); browser origins come from `WEB_ORIGIN` / `WEB_ORIGINS`.
- **Fact:** `npm run db:migrate -w @post-anki/api` refuses non-local hosts unless `CI` or `ALLOW_REMOTE_DB_MIGRATE=1` (`apps/api/scripts/migrate.ts:18-38`); migrations table `drizzle.drizzle_migrations_api`.
- **Fact:** local dev DB (container `post-anki-dev-db`, Postgres 16.15, pgvector 0.8.7) is 12 MB with 113 applied migrations (0000-0112) and 26 subjects; it has an `electric_publication_default` publication. Migration 0109 uses `halfvec`, which needs pgvector >= 0.7.0.
- **Fact:** the web image reads `API_BASE_URL` and `API_SHARED_SECRET` at runtime (`apps/web/Dockerfile`, `apps/web/src`); the web app has no login of its own.
- **Fact:** DNS for `ilya.online` is on Route 53 (public NS lookup); `postanki.ilya.online` and `api.postanki.ilya.online` currently CNAME to `ghs.googlehosted.com` (the GCP server); `dev.postanki.ilya.online` has no record.
- **Fact:** a push to `main` runs `.github/workflows/deploy.yml`, which deploys GCP and migrates the database in `PROD_DATABASE_URL`.
- **Fact:** local `pg_dump` is 14.12 (too old for a 16 server); dumps must run inside the `post-anki-dev-db` container.
- **Fact (what the built Lambda path still lacks):** the Neon database is below migration 0104 and needs 0104-0112; Neon's pgvector docs list `halfvec` support, but the installed version on that database is unverified; the SSM parameters are not created; the Lambda env sets `DURABLE_EXTRACTION_ENGINE=inngest` but not `DURABLE_EXTRACTION` / `DURABLE_CARDS` / `DURABLE_COURSE_JOBS`, so after-response jobs would still run in-process and freeze (`infra-aws/lambda-api.ts:81-86`, `apps/api/src/shared/env.ts:57-76`); a function URL has no custom-domain support, so CloudFront plus a certificate would be needed; and the Lambda lives in the same stack as the ALB and Fargate services (`infra-aws/index.ts:431`), so a `pulumi up` there also creates the paid load balancer and containers.

### Option comparison (prices checked 2026-10-24)
| Option | What it covers | Monthly cost | Fits $10? |
|---|---|---|---|
| **A. One VPS (Hetzner CX23, 2 vCPU / 4 GB / 40 GB) + Caddy + Postgres + Electric + API + web, both envs** | Everything | €5.49 + €0.50 IPv4 = €5.99 (~$6.90) excl. VAT | Yes, see cost table |
| B. Lambda + CloudFront + Neon free (already-built Lambda path) | API only; no Electric, no web | ~$0 (Lambda 1M requests and 400k GB-s always free; CloudFront 1 TB and 10M requests always free) | Yes, but drops Electric and web |
| B+. Same plus Electric on Fargate | Adds live sync | 0.25 vCPU / 0.5 GB ≈ $9.01 per Electric task (Fargate $0.04048/vCPU-h, $0.004445/GB-h) + public IPv4; and Electric keeps Neon awake (below) | No |
| C. Neon with Electric attached | Database for live sync | A connected replication subscriber keeps the Neon compute on all the time: ~182 CU-h per env per month against 100 free per project; Launch $0.106/CU-h ≈ $19 per env | No |
| D. Mac at home + Cloudflare Tunnel / Tailscale | Everything, Mac must stay awake | $0; Cloudflare Tunnel needs the whole `ilya.online` zone moved to Cloudflare; Tailscale Funnel gives a `ts.net` name, not the owner's domain | Price yes, requirements no |
| E. Free PaaS (Render free sleeps after idle, ~1 min wake; Fly.io has no free tier for new accounts, 512 MB machine $3.19, 1 GB $5.70, IPv4 $2) | API + web | Fly for API + web + Electric + Postgres, two envs, > $20 | No |
| F. Oracle Cloud Always Free Ampere | Everything | $0, but reports say the free allowance was halved in 2026, instances were disabled after the change, and idle instances can be reclaimed | Price yes, reliability no; fallback only |

Recommendation: **A**. It is the only option that covers API, database, live sync and web for both environments under $10. Option B is cheaper but leaves out live sync and web, and adding live sync to it costs more than all of A.

### Line-by-line monthly cost of A
| Line | Cost / month | Source / label |
|---|---|---|
| Hetzner CX23 server | €5.49 (~$6.31) | Fact (third-party, Aug 2026): https://kimmo.suominen.com/stuff/cpc-2026-08.txt |
| Hetzner primary IPv4 | €0.50 (~$0.58) | Fact (third-party): https://www.bitdoze.com/md/hetzner-cloud-cost-optimized-plans.md |
| Route 53 hosted zone `ilya.online` (already paid, shared) | $0.50 | Assumption (third-party): https://handbook.vantage.sh/aws/services/route-53-pricing/ |
| Route 53 queries | < $0.01 | Fact: $0.40 per million queries, https://aws.amazon.com/route53/pricing/ |
| TLS certificates (Let's Encrypt via Caddy) | $0 | Assumption: Let's Encrypt is free |
| Postgres, Electric, API, web on the server | $0 | Included in the server |
| Backups (nightly on server + owner pulls to Mac) | $0 | Hetzner backup add-on not used |
| Neon | $0 | Not used for live data; old database left untouched |
| Domain `ilya.online` renewal (already owned, shared) | ~$2.33 ($28/yr) | Assumption: registrar unknown, aggregator price https://domainoffer.net/tld/online/unstoppabledomains |
| **Total, server + DNS** | **~$7.40** excl. VAT, **~$8.80** with 20% VAT | EUR->USD ~1.15 is an Assumption |
| **Total incl. full domain renewal** | **~$9.70** excl. VAT, **~$11.10** with VAT | Over $10 only if VAT applies and the whole domain fee is charged to post-anki |
| OpenRouter LLM usage | variable, capped per day | Not hosting; prod cap $0.50/day, dev $0.10/day, worst case ~$18/month |

Closest fit if the total must include VAT and the whole domain fee: the same setup on Oracle Always Free (~$2.83 incl. domain), with the reliability risks above. If CX23 is unavailable, CAX11 (€5.99 + €0.50) is the next option, which adds about $0.58.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `resolveHostnames` (`infra-vps/hostnames.ts`) | domain, `attachProdDns` flag | list of `{env, role, hostname, managed}` for prod/dev x api/web; prod records only when flag on | SCENARIO 2, SCENARIO 8 |
| `resolveEnvironment` (`infra-vps/scripts/environment.ts`) | env name | compose project name, database and role names, container aliases, hostnames, LLM daily cap; rejects anything but `dev`/`prod` | SCENARIO 2, SCENARIO 4, SCENARIO 5 |
| `compareMigrationState` (`infra-vps/scripts/migration-state.ts`) | migration journal tags, applied hashes count + last created_at | `matches` / `behind` (pending tags) / `ahead` / `empty` | SCENARIO 3, SCENARIO 4 |
| `checkVectorVersion` (`infra-vps/scripts/migration-state.ts`) | installed extension version string or null | ok / too old / missing, with reason (needs >= 0.7.0) | SCENARIO 3 |
| `evaluateSmoke` (`infra-vps/scripts/smoke-checks.ts`) | collected responses: health, unauthenticated data call, authenticated data call, http redirect, web without password, wrong-env token | list of named pass/fail with plain reason; overall verdict | SCENARIO 1, SCENARIO 2, SCENARIO 7 |
| `decidePromotion` (`infra-vps/scripts/promotion-gate.ts`) | HEAD sha, dev deployed sha, tree clean, dev smoke verdict, images present | allow, or refuse with reason | SCENARIO 5, SCENARIO 6 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | None | None | `infra-vps/server/Caddyfile`, `infra-vps/server/env.compose.yml`, `infra-vps/scripts/smoke.sh`, `infra-vps/scripts/smoke-checks.ts`, `infra-vps/scripts/mint-token.sh` |
| SCENARIO 2 | None | None | `infra-vps/scripts/environment.ts`, `infra-vps/scripts/put-secrets.sh`, `infra-vps/server/env.compose.yml`, `infra-vps/hostnames.ts` |
| SCENARIO 3 | None | None | `infra-vps/scripts/db-status.sh`, `infra-vps/scripts/db-status.ts`, `infra-vps/scripts/migration-state.ts`, `infra-vps/scripts/copy-local-db.sh`, `infra-vps/scripts/create-databases.sh` |
| SCENARIO 4 | None | None | `infra-vps/scripts/migrate.sh`, `infra-vps/scripts/backup.sh`, `infra-vps/server/backup.sh` |
| SCENARIO 5 | None | None | `infra-vps/scripts/promote.sh`, `infra-vps/scripts/promotion-gate.ts`, `infra-vps/scripts/deploy.sh`, `infra-vps/scripts/build-images.sh`, `infra-vps/scripts/ship-images.sh` |
| SCENARIO 6 | None | None | `infra-vps/scripts/rollback.sh`, `docs/ci-cd/vps-hosting-runbook.md` |
| SCENARIO 7 | None | None | `infra-vps/server/Caddyfile`, `infra-vps/server/shared.compose.yml`, `infra-vps/server/env.compose.yml` |
| SCENARIO 8 | None | None | `infra-vps/index.ts`, `infra-vps/hostnames.ts`, `infra-vps/Pulumi.main.yaml` |
| SCENARIO 9 | None | None | `docs/ci-cd/vps-hosting-runbook.md`, `docs/architecture/paid-services.md`, `.dockerignore` |

### Files to create
```
infra-vps/
  Pulumi.yaml                 project post-anki-infra-vps; config keys documented, no secrets
  Pulumi.main.yaml            serverType cx23, location nbg1, image ubuntu-24.04, domain ilya.online, aws:region us-east-1, attachProdDns false, sshAllowedCidrs, sshPublicKey (public key text)
  package.json                @pulumi/pulumi, @pulumi/aws, @pulumi/hcloud; typescript, @types/node; script typecheck
  tsconfig.json               mirrors infra-aws/tsconfig.json, files index.ts + hostnames.ts
  index.ts                    hcloud SSH key, firewall (22 from sshAllowedCidrs, 80, 443), server with cloud-init, Route 53 A + AAAA per managed hostname, TTL 60; outputs ipv4, ipv6, hostnames
  hostnames.ts                resolveHostnames deriver
  hostnames.test.ts
  cloud-init.yaml             docker engine + compose plugin from Docker apt repo, 2 GB swap, unattended-upgrades, sshd key-only, /etc/postanki (0700 root), /var/backups/postanki, backup timer install
  server/
    shared.compose.yml        postgres (pgvector/pgvector:pg16, wal_level=logical, mem 768m, named volume, no published ports), caddy (caddy:2, ports 80/443, Caddyfile, data volume, env_file /etc/postanki/caddy.env), network postanki-shared
    env.compose.yml           per-env api (postanki-api:${IMAGE_TAG}, mem 384m, healthcheck /_healthz), web (postanki-web:${IMAGE_TAG}, mem 256m, API_BASE_URL=http://api-${ENV}:8030), electric (electricsql/electric:1.7.7, ELECTRIC_INSECURE=true, storage volume, mem 384m); env_file /etc/postanki/${ENV}.env; aliases api-${ENV}, web-${ENV} on postanki-shared; restart unless-stopped
    Caddyfile                 4 sites from env placeholders; web sites basic_auth with hash from env; api sites plain reverse_proxy; {$CADDY_GLOBAL} hook so a local rehearsal can use local_certs
    rehearsal.compose.yml     local-only override: hostnames *.localhost, LLM_MODE=mock, local_certs, dummy secrets from rehearsal.env.example
    rehearsal.env.example     dummy values only
    backup.sh                 pg_dump -Fc per database into /var/backups/postanki, keep 7 nightly + 5 labelled
    postanki-backup.service
    postanki-backup.timer     nightly
  scripts/
    lib.sh                    env arg check (dev|prod), ssh target from POSTANKI_SSH or `pulumi stack output ipv4`, typed confirmation for prod, never set -x, never echo secrets
    preflight.sh              local tool + git checks; --remote adds ssh/docker reachability (free)
    put-secrets.sh            prompts (read -s) and writes /etc/postanki/<env>.env and caddy.env over ssh with umask 077; generates DB role password and API_SHARED_SECRET when left blank; --dry-run lists keys only
    create-databases.sh       idempotent: role postanki_<env> (LOGIN REPLICATION) and database postanki_<env>, CREATE EXTENSION vector
    build-images.sh           buildx --platform linux/amd64, tags postanki-api:<sha> and postanki-web:<sha>; refuses a dirty tree
    ship-images.sh            docker save | gzip | ssh docker load; skips images already present
    deploy.sh                 <env> [--sha <sha>]: ship, create DB if missing, backup, migrate, compose up, write /etc/postanki/<env>.deployed-sha, run smoke
    migrate.sh                <env>: labelled backup then compose run --rm -e ALLOW_REMOTE_DB_MIGRATE=1 api npm run db:migrate
    backup.sh                 <env> [label]: runs server backup.sh for one database
    pull-backups.sh           rsync /var/backups/postanki -> ~/post-anki-backups (outside the repo)
    db-status.sh              <env|local>: read-only transaction query -> JSON -> db-status.ts
    db-status.ts              prints schema level, vector version, row counts; diff against local when both given
    environment.ts            resolveEnvironment deriver (+ tiny CLI used by the shell scripts)
    environment.test.ts
    migration-state.ts        compareMigrationState + checkVectorVersion
    migration-state.test.ts
    copy-local-db.sh          <env>: dump inside post-anki-dev-db (-Fc --no-owner --no-acl --no-publications --no-subscriptions), refuse non-empty target, typed confirm, scp, pg_restore as postanki_<env>, migrate, db-status
    smoke.sh                  <env>: curl checks; token from SMOKE_TOKEN env or read -s prompt; web password the same way; feeds smoke-checks.ts
    smoke-checks.ts           evaluateSmoke
    smoke-checks.test.ts
    mint-token.sh             <env> "<label>": compose run --rm api node --import tsx scripts/create-api-token.ts; token shown once on the terminal only
    promote.sh                promotion-gate then deploy.sh prod --sha <dev sha>
    promotion-gate.ts         decidePromotion
    promotion-gate.test.ts
    rollback.sh               <env> <sha>: images present check, typed confirm, compose up with that tag, smoke; prints the DB-restore steps
docs/ci-cd/vps-hosting-runbook.md            manual steps with commands and costs, promotion, rollback, cutover, backups, token setup on the phone
docs/architecture/hosting/vps-hosting.md     current-shape doc (diagram, hostnames, isolation, secrets, backups)
```

### Files to modify
```
.dockerignore                      add apps/ios, .planning, e2e, e2e-local, infra, infra-aws, infra-vps, proof, apps/api/dist-lambda, **/Local.xcconfig; keep every existing line
  used by: apps/api/Dockerfile, apps/web/Dockerfile, apps/bot/Dockerfile builds (repo-root context)
  tests: none
docs/architecture/paid-services.md add Hetzner VPS row, Let's Encrypt row, mark AWS rows "not deployed", add the cost table link; keep other rows
  used by: none found
  tests: none
```
Nothing under `apps/api`, `apps/web` or `apps/ios` changes. `infra/`, `infra-aws/` and `.github/workflows/deploy.yml` stay untouched.

### Risk & rollout
- See `architecture.md` "Failure modes" and "Rollout".
- Blast radius: the GCP server and its database keep serving until the owner flips the prod DNS records; a push to `main` still redeploys GCP and migrates its database, unchanged by this work.
- Before prod is safe: both env files must exist on the server with `API_SHARED_SECRET` set, and the Caddy password hash must be set, or the web and API are open. `smoke.sh` fails on either gap.
- Rollback paths: image rollback (`rollback.sh`), database restore from the labelled pre-migration dump, DNS rollback to `ghs.googlehosted.com` while GCP is alive.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 3 | none checked in; the owner's own local database is the data | owner runs `copy-local-db.sh`; local rehearsal uses an empty migrated database plus `LLM_MODE=mock` |

### Documentation changes
- Create `docs/architecture/hosting/vps-hosting.md` (new `hosting` domain; current shape only).
- Create `docs/ci-cd/vps-hosting-runbook.md`, next to `docs/ci-cd/gcp-setup.md`.
- Update `docs/architecture/paid-services.md` rows as listed above.
- Proposed, owner-only (outside this repo): add Hetzner VPS, Caddy and `@pulumi/hcloud` to post-anki in `~/webdata/ilya-projects/ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md`.

### Decisions made autonomously
- Recommend one VPS (option A) over Lambda + Neon: the budget now includes live sync and web, and live sync on Neon or Fargate costs more than the whole VPS.
- Deviation from the earlier ask: the owner asked for a Neon branch per environment. I recommend Postgres on the VPS because a connected Electric subscriber keeps Neon compute on 24/7 (Neon docs), about $19 per env on Launch. The old Neon database stays untouched and read-only from this work.
- Hostnames: API at `api.postanki.ilya.online` / `api.dev.postanki.ilya.online`, web at `postanki.ilya.online` / `dev.postanki.ilya.online`. The iPhone app already defaults to the first, and both existing infra stacks reserve the root name for web.
- Server type CX23 (x86, cheapest, about €0.50 below CAX11); images are cross-built on the Mac with buildx. Fall back to CAX11 (arm, native build) if CX23 can't be ordered.
- No image registry and no CI deploy: images ship over SSH as `docker save` streams. This costs nothing and keeps deploys owner-triggered.
- Background jobs run in-process (durable flags off, no Inngest), because the server is always on. That removes one account and one set of secrets per env.
- Web addresses sit behind a Caddy password, because the web app has no login and calls the API with the shared secret.
- Pulumi state on the local file backend (`file://~/.pulumi-postanki`), which is free. The state holds no secrets: the Hetzner token comes from `HCLOUD_TOKEN` and AWS credentials from the owner's profile at run time.
- New dependency `@pulumi/hcloud`, proposed rather than silently added; the owner approves it in the TECH-STACK step.
- Daily LLM caps: prod $0.50, dev $0.10, set in each env file. Owner-adjustable.
- Data: copy the local database (newest schema, real data) into fresh empty databases instead of migrating and merging the old Neon data (9 subjects, schema below 0104).
- Scheduled pipeline jobs that GCP Cloud Scheduler runs today are not recreated; this is recorded in Scope boundary.
- Prod DNS cutover first removes the two hand-made CNAMEs (`postanki`, `api.postanki` → `ghs.googlehosted.com`) with one documented `aws route53 change-resource-record-sets` call by the owner. This is a one-time exception to "IaC only": those records were never in any IaC, and Route 53 won't hold an A record next to a CNAME. From then on Pulumi owns the records.
- Local rehearsal host ports come from the devports registry (`~/.claude/devports/`), loopback only.
- Grill-plan subagent not dispatched: this run is non-interactive and has no agent tool. The self-grill findings were folded into Risk & rollout and Failure modes.

### Implementation order
1. `resolveHostnames`, `resolveEnvironment`, `compareMigrationState` + `checkVectorVersion`, `evaluateSmoke`, `decidePromotion`: red-green-refactor, covering SCENARIO 2, 3, 4, 5, 1, 7.
2. Pulumi program (`infra-vps/index.ts`, configs, cloud-init): SCENARIO 8.
3. Server compose files, Caddyfile, backup units, local rehearsal: SCENARIO 1, 2, 7.
4. Owner scripts (secrets, databases, build/ship, deploy, migrate, backup, status, copy, smoke, token, promote, rollback): SCENARIO 3, 4, 5, 6.
5. `.dockerignore`, runbook, architecture doc, paid-services update: SCENARIO 9.

### Scope boundary
- No deploy, no server rental, no DNS change, no secret entry, no Neon write: all owner steps in the runbook.
- No change to `apps/api`, `apps/web`, `apps/ios`, `infra/`, `infra-aws/` or `.github/workflows/`.
- Telegram bot hosting and GCP Cloud Scheduler jobs are not recreated on the VPS.
- GCP shutdown and retiring the push-to-main deploy stay with the existing `aws-electric-fargate-deploy` item.
- No PowerSync service (the iPhone app's sync spike).
- No off-site backup service; backups are pulled to the Mac by the owner.
- No monitoring or alerting beyond the smoke check and container health checks.
