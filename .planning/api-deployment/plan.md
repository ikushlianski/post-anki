---
type: plan
branch: learn-from-doc-site
task: Host post-anki (API, database, live sync, web) for the owner's iPhone app, dev + prod, under $10/month
state: confirmed
updated: 2026-10-24
---
# Plan: post-anki hosting for the iPhone app

This plan builds everything the owner needs to run post-anki on one rented Hetzner server (CX23, about €5.99 a month): Caddy terminates https for four addresses, one Postgres holds separate prod and dev databases, and each environment runs its own API, web app and Electric. It rests on one idea: the server is the environment boundary only in name, because each environment's isolation comes from its own database, secrets file and container group. Deliberate non-changes: no app code changes, no schema migration, no Neon write, no change to the GCP or AWS stacks or to CI, and no deploy by the implementer.

**Legend:** ➕ add · ✏️ change · ➖ remove

## 1. Database
| | Item | Change | Why |
|---|---|---|---|
| ➕ | `postanki_prod`, `postanki_dev` databases on the server's Postgres 16 + pgvector | Created empty by `create-databases.sh`, roles `postanki_<env>` with LOGIN REPLICATION, `CREATE EXTENSION vector` | Per-env isolation; Electric needs replication |
| ➕ | One-time copy | `copy-local-db.sh` dumps `post-anki-dev-db` inside its own container (`-Fc --no-owner --no-acl --no-publications --no-subscriptions`) and restores into the empty target | Local is the real data at 0112; Neon is stale (<0104) |
| ✏️ | Later schema changes | Only `npm run db:migrate -w @post-anki/api` inside the API image with `ALLOW_REMOTE_DB_MIGRATE=1`, after a labelled backup | Existing migrate script; never push |

## 2. Permissions
| Address | Who gets in |
|---|---|
| `api.postanki.ilya.online` / `api.dev.postanki.ilya.online` | Bearer token: a per-device `pat_` token minted into that env's DB, or that env's `API_SHARED_SECRET`; `/_healthz` is open |
| `postanki.ilya.online` / `dev.postanki.ilya.online` | Caddy basic auth (owner password, bcrypt hash in `/etc/postanki/caddy.env`) |
| Postgres, Electric | Not reachable from outside the server |
| SSH | Key only, from `sshAllowedCidrs` |

## 3. Business rules
- `resolveHostnames`: four fixed hostnames; prod records managed only when `attachProdDns` is on.
- `resolveEnvironment`: only `dev`/`prod`; names, aliases, LLM caps (prod $0.50/day, dev $0.10/day).
- `compareMigrationState`: journal vs applied → matches / behind (pending tags) / ahead / empty.
- `checkVectorVersion`: requires pgvector >= 0.7.0 (halfvec in 0109).
- `evaluateSmoke`: health ok, unauthenticated 401, authenticated 200, http→https, web needs password, wrong-env token refused.
- `decidePromotion`: clean tree, HEAD equals dev's deployed sha, dev smoke green, images present.

## 4. Services
| | Component | What it does |
|---|---|---|
| ➕ | `infra-vps/index.ts` (Pulumi, stack `main`, local file backend) | Hetzner SSH key, firewall, CX23 server with cloud-init; Route 53 A/AAAA TTL 60 |
| ➕ | `infra-vps/server/shared.compose.yml` | Postgres (768 MB limit), Caddy (80/443) |
| ➕ | `infra-vps/server/env.compose.yml` | Per env: API (384 MB), web (256 MB), Electric 1.7.7 (384 MB) |
| ➕ | `infra-vps/server/Caddyfile` | Four sites, automatic Let's Encrypt, password on web |
| ➕ | `infra-vps/server/backup.sh` + timer | Nightly `pg_dump -Fc` per DB, keep 7 + 5 labelled |
| ➕ | `infra-vps/scripts/*.sh` | Owner-run: preflight, put-secrets, create-databases, build/ship images, deploy, migrate, backup, pull-backups, db-status, copy-local-db, smoke, mint-token, promote, rollback |

## 5. Validation
| Input | Rule |
|---|---|
| Env argument | `dev` or `prod` only (Zod in `environment.ts`) |
| Prod actions | Typed confirmation `prod` |
| Copy target | Must have zero user tables |

## 8. Background jobs
- Extraction, card and course jobs run in-process (durable flags unset, no Inngest), since the server is always on.
- Nightly backup timer on the server.

## 11. Tests
- Vitest suites for the five derivers in `infra-vps`, run with `npx vitest run infra-vps` from the repo root.
- Local rehearsal (A4): the full owner flow against a local stack with `LLM_MODE=mock`, on loopback ports allocated through devports.

## 12. Docs
- ➕ `docs/ci-cd/vps-hosting-runbook.md`: manual steps, costs, promotion, rollback, cutover, phone setup.
- ➕ `docs/architecture/hosting/vps-hosting.md`: current shape.
- ✏️ `docs/architecture/paid-services.md`: Hetzner and Let's Encrypt rows; AWS rows marked not deployed.
- ✏️ `.dockerignore`: exclude `apps/ios`, `.planning`, infra folders, `**/Local.xcconfig`.

## 13. After deploy: Manual steps (owner runs, costs money)
Costs are monthly. Every secret is typed at a hidden prompt (`read -s`) and never written to the repo.

| # | Step | Command | Cost |
|---|---|---|---|
| 1 | Approve decisions and the TECH-STACK entry | edit `ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md` | $0 |
| 2 | Hetzner account and API token (check CX23 availability) | console; then `read -s HCLOUD_TOKEN; export HCLOUD_TOKEN` | $0 |
| 3 | Pulumi state and stack | `pulumi login file://~/.pulumi-postanki && cd infra-vps && npm ci && pulumi stack init main && pulumi config set sshPublicKey "$(cat ~/.ssh/id_ed25519.pub)"` | $0 |
| 4 | Preview | `cd infra-vps && AWS_PROFILE=<profile> pulumi preview` | $0 |
| 5 | **Rent server + dev DNS** | `cd infra-vps && AWS_PROFILE=<profile> pulumi up` | **€5.49 + €0.50 IPv4 (~$6.90) excl. VAT** |
| 6 | Remote preflight | `infra-vps/scripts/preflight.sh --remote` | $0 |
| 7 | Secrets per env + web password | `infra-vps/scripts/put-secrets.sh dev` then `prod` | $0 (LLM usage capped per day) |
| 8 | Databases and data copy | `infra-vps/scripts/create-databases.sh prod`, `... dev`, `copy-local-db.sh prod`, `copy-local-db.sh dev`, `db-status.sh prod` | $0 |
| 9 | Deploy dev | `infra-vps/scripts/build-images.sh && infra-vps/scripts/deploy.sh dev` | $0 |
| 10 | Dev token + phone | `infra-vps/scripts/mint-token.sh dev "iPhone dev"`; `smoke.sh dev`; Settings → `https://api.dev.postanki.ilya.online`, paste token | $0 |
| 11 | Deploy prod (before DNS) | `infra-vps/scripts/deploy.sh prod` | $0 |
| 12 | **Prod DNS cutover** | remove the two hand-made CNAMEs (`postanki`, `api.postanki` → `ghs.googlehosted.com`) with `aws route53 change-resource-record-sets` (exact JSON in the runbook; one-time exception, these records are not in any IaC), then `pulumi config set attachProdDns true && pulumi up` | < $0.01 |
| 13 | Prod check + token + phone | `smoke.sh prod`; `mint-token.sh prod "iPhone"`; Settings → `https://api.postanki.ilya.online` | $0 |
| 14 | Weekly backup pull | `infra-vps/scripts/pull-backups.sh` | $0 |
| 15 | Each release | `deploy.sh dev`, check, then `promote.sh` | $0 |
| 16 | Rollback | `rollback.sh prod <sha>`; DB: restore the labelled pre-migration dump (runbook); DNS: recreate the GCP CNAMEs while GCP is alive | $0 |
| 17 | Later, separate item | GCP shutdown and disabling the push-to-main deploy | saves GCP cost |

## Out of scope
- Any deploy, rental, DNS or secret step by the implementer; any Neon write.
- Changes to `apps/api`, `apps/web`, `apps/ios`, `infra/`, `infra-aws/`, `.github/workflows/`.
- Telegram bot and GCP Cloud Scheduler jobs on the VPS; PowerSync; off-site backup service; monitoring beyond smoke and health checks.
- GCP shutdown (existing `aws-electric-fargate-deploy` item).
