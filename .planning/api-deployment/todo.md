---
type: todo
branch: learn-from-doc-site
task: Host post-anki (API, database, live sync, web) for the owner's iPhone app, dev + prod, under $10/month
state: open
updated: 2026-10-24
---
# Todo: post-anki hosting for the iPhone app

Contract: `spec.md` (Facts, Derivers, Decisions, Files). Each aspect owns its files exclusively; never edit a file owned by another aspect. Waves: A1 first; A2 and A3 in parallel after A1; A4 after A2 and A3; A5 last.

Hard rules for every aspect:
- Spend nothing and deploy nothing. Never run `pulumi up`, `pulumi preview`, `pulumi stack init`, `pulumi login` against a cloud backend, `hcloud`, `aws` (any subcommand), `ssh`/`scp`/`rsync` to a remote host, or anything that writes DNS or touches Neon.
- Never read, print or copy `.env`, `.env.*`, `apps/api/.env*` or `apps/ios/Local.xcconfig`; scripts never `source` them and never echo secret values.
- Nothing under `apps/api`, `apps/web`, `apps/ios`, `infra/`, `infra-aws/` or `.github/` changes.
- Local validation only: `npx vitest run infra-vps` from the repo root, `npx tsc --noEmit` in `infra-vps`, `docker compose ... config`, `caddy validate` in a container, `bash -n`, `shellcheck` when installed, local docker builds and the local rehearsal.

## Decisions to make
- Owner: approve the deviation from "Neon branch per env" to Postgres on the VPS (reason in `spec.md` Decisions).
- Owner: approve the new dependency `@pulumi/hcloud` and the TECH-STACK entry (Hetzner VPS, Caddy).
- Owner: confirm the LLM daily caps (prod $0.50, dev $0.10).

## To review / clarify
- Hetzner CX/CAX availability: a third-party report (Aug 2026) says the cost-optimized lines showed "currently not available". The owner checks before renting.
- Whether the old Neon database (9 subjects) holds anything not in local; it stays untouched either way.

## Aspect A1 — Derivers

**Goal:** the pure rules every script and the infra program rely on exist, tested in business language.

**Criteria:**
- `resolveHostnames` returns the four hostnames from `spec.md`; prod records are unmanaged unless `attachProdDns` is on.
- `resolveEnvironment` accepts only `dev`/`prod` and returns project, database, role, aliases, hostnames and LLM cap per `spec.md`.
- `compareMigrationState` reports matches / behind with pending tags / ahead / empty; `checkVectorVersion` rejects missing and < 0.7.0, accepts 0.7.0, 0.8.7, 0.10.0.
- `evaluateSmoke` fails on: health not ok, unauthenticated data call not 401, authenticated call not 200, http not redirecting to https, web served without password, wrong-env token accepted.
- `decidePromotion` refuses on dirty tree, HEAD different from dev's deployed sha, failing dev smoke or missing images, and gives a plain reason each time.
- Every test name says the guarantee (`should refuse promotion when ...`); `npx vitest run infra-vps` passes.

**Coding tasks:**
- [ ] Write tests then implement resolveHostnames
- [ ] Write tests then implement resolveEnvironment with a small CLI printing JSON
- [ ] Write tests then implement compareMigrationState and checkVectorVersion
- [ ] Write tests then implement evaluateSmoke
- [ ] Write tests then implement decidePromotion

**Notes:**
- Owns: `infra-vps/hostnames.ts`, `infra-vps/hostnames.test.ts`, `infra-vps/scripts/environment.ts`, `infra-vps/scripts/environment.test.ts`, `infra-vps/scripts/migration-state.ts`, `infra-vps/scripts/migration-state.test.ts`, `infra-vps/scripts/smoke-checks.ts`, `infra-vps/scripts/smoke-checks.test.ts`, `infra-vps/scripts/promotion-gate.ts`, `infra-vps/scripts/promotion-gate.test.ts`.
- Depends on: none.
- Zod for CLI input parsing. No `any`. The migration journal is `apps/api/src/db/migrations/meta/_journal.json` (read only).

## Aspect A2 — Server and DNS as code

**Goal:** a Pulumi program that, when the owner runs it, rents one Hetzner server with a firewall and startup recipe and writes the DNS records, with prod records off until cutover.

**Criteria:**
- `npm install` and `npx tsc --noEmit` in `infra-vps` pass; no secret in any committed file; Hetzner token only from `HCLOUD_TOKEN`.
- Firewall allows 22 from `sshAllowedCidrs`, 80 and 443; nothing else.
- Route 53 A + AAAA records, TTL 60, only for hostnames `resolveHostnames` marks managed; zone looked up by name `ilya.online`.
- Cloud-init installs Docker Engine and the compose plugin from Docker's apt repo, adds 2 GB swap, enables unattended upgrades, sets SSH to keys only, and creates `/etc/postanki` (0700) and `/var/backups/postanki`; it parses as valid YAML.
- Outputs `ipv4`, `ipv6`, `hostnames`. `Pulumi.yaml` comments list every config key and the local file backend login command.

**Coding tasks:**
- [ ] Add Pulumi project files, package.json and tsconfig
- [ ] Add hcloud SSH key, firewall and server with cloud-init
- [ ] Add Route 53 records from resolveHostnames
- [ ] Write cloud-init recipe

**Notes:**
- Owns: `infra-vps/Pulumi.yaml`, `infra-vps/Pulumi.main.yaml`, `infra-vps/package.json`, `infra-vps/package-lock.json`, `infra-vps/tsconfig.json`, `infra-vps/index.ts`, `infra-vps/cloud-init.yaml`.
- Depends on: A1 (`hostnames.ts`).
- Follow `infra-aws/index.ts` style. Check the current `@pulumi/hcloud` server/firewall argument names via context7 or the Pulumi registry, never from memory. Never run any `pulumi` command except `pulumi version`.

## Aspect A3 — Containers, front door, backups

**Goal:** the server-side compose files, Caddyfile and backup units run prod and dev side by side with only Caddy exposed, and a local rehearsal override exists.

**Criteria:**
- `docker compose -f shared.compose.yml -f env.compose.yml -f rehearsal.compose.yml --env-file rehearsal.env.example config` succeeds for `ENV=dev` and `ENV=prod`.
- `caddy validate` (in the `caddy:2` image) passes with the rehearsal env; web sites require basic auth; API sites don't; http redirects to https.
- Postgres and Electric publish no ports; each env's API reaches only its own Electric and database; memory limits as in `spec.md`.
- Backup script keeps 7 nightly + 5 labelled dumps per database; the timer runs nightly.
- `.dockerignore` gains the lines in `spec.md`; `docker build -f apps/api/Dockerfile .` and `docker build -f apps/web/Dockerfile .` still succeed locally.

**Coding tasks:**
- [ ] Write shared.compose.yml with postgres and caddy
- [ ] Write env.compose.yml with api, web and electric per env
- [ ] Write Caddyfile with four sites, password on web
- [ ] Write rehearsal override and dummy env example
- [ ] Write server backup script and systemd units
- [ ] Extend .dockerignore and rebuild api and web images locally

**Notes:**
- Owns: `infra-vps/server/shared.compose.yml`, `infra-vps/server/env.compose.yml`, `infra-vps/server/Caddyfile`, `infra-vps/server/rehearsal.compose.yml`, `infra-vps/server/rehearsal.env.example`, `infra-vps/server/backup.sh`, `infra-vps/server/postanki-backup.service`, `infra-vps/server/postanki-backup.timer`, `.dockerignore`.
- Depends on: A1 (names from `resolveEnvironment`).
- Rehearsal host ports: allocate through `~/.claude/devports/` (read `SKILL-CONTRACT.md` first); bind to 127.0.0.1 only. Electric image stays `electricsql/electric:1.7.7` (same as `docker-compose.yml`). API env per env: `DATABASE_URL`, `ELECTRIC_SERVICE_URL=http://electric-${ENV}:3000`, `ELECTRIC_AUTH_MODE=none`, `WEB_ORIGIN`, `API_SHARED_SECRET`, `OPENROUTER_API_KEY`, `LLM_DAILY_BUDGET_USD`, `PORT=8030`.

## Aspect A4 — Owner-run scripts and local rehearsal

**Goal:** every owner step in the runbook is one script with a safe default, proven end to end against a local rehearsal stack.

**Criteria:**
- `lib.sh` runs commands over SSH, or locally when `POSTANKI_TARGET=local` (rehearsal), with the secrets directory overridable for rehearsal; prod actions need the typed word `prod`.
- `put-secrets.sh --dry-run` lists keys only; real mode reads with `read -s`, writes with umask 077, and never echoes values.
- Local rehearsal passes: create-databases, copy-local-db into rehearsal dev (reads the real local DB only through `pg_dump`), db-status shows `matches` and pgvector 0.8.7, deploy dev, mint token, smoke dev green, promote to prod, smoke prod green, rollback prod to the previous tag.
- `copy-local-db.sh` refuses a non-empty target and runs no write without confirmation; `migrate.sh` always backs up first.
- All scripts pass `bash -n` (and `shellcheck` when installed); no script contains a real hostname IP, token or connection string.

**Coding tasks:**
- [ ] Write lib.sh and preflight.sh
- [ ] Write put-secrets.sh and create-databases.sh
- [ ] Write build-images.sh, ship-images.sh and deploy.sh
- [ ] Write migrate.sh, backup.sh and pull-backups.sh
- [ ] Write db-status.sh, db-status.ts and copy-local-db.sh
- [ ] Write smoke.sh and mint-token.sh
- [ ] Write promote.sh and rollback.sh
- [ ] Run the full local rehearsal and record results in the impl report

**Notes:**
- Owns: `infra-vps/scripts/lib.sh`, `preflight.sh`, `put-secrets.sh`, `create-databases.sh`, `build-images.sh`, `ship-images.sh`, `deploy.sh`, `migrate.sh`, `backup.sh`, `pull-backups.sh`, `db-status.sh`, `db-status.ts`, `copy-local-db.sh`, `smoke.sh`, `mint-token.sh`, `promote.sh`, `rollback.sh` (all under `infra-vps/scripts/`).
- Depends on: A1, A2 (stack output `ipv4`), A3 (compose and backup paths).
- Rehearsal uses `LLM_MODE=mock`, never a real OpenRouter key. Never write to `post-anki-dev-db`. Tear the rehearsal stack and its volumes down afterwards.

## Aspect A5 — Runbook and docs

**Goal:** the owner can go from nothing to a working phone using only the runbook, with every paid step and its cost visible.

**Criteria:**
- Runbook has a section titled exactly "Manual steps (owner runs, costs money)", in the order of `architecture.md` Rollout, each with the exact command and monthly cost; it also covers phone setup (address + token in Settings), promotion, rollback, DNS rollback to GCP, weekly backup pull.
- Cost table matches `spec.md` line by line, with source links and Fact/Assumption labels.
- `docs/architecture/hosting/vps-hosting.md` describes the current shape (Mermaid diagram, hostnames, isolation, secrets, backups) with no history sentences.
- `paid-services.md` rows updated as in `spec.md`.

**Coding tasks:**
- [ ] Write vps-hosting-runbook.md with manual steps and costs
- [ ] Write hosting/vps-hosting.md architecture doc
- [ ] Update paid-services.md rows

**Notes:**
- Owns: `docs/ci-cd/vps-hosting-runbook.md`, `docs/architecture/hosting/vps-hosting.md`, `docs/architecture/paid-services.md`.
- Depends on: A2, A3, A4 (final script names and flags).
