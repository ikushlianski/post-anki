# Plan: shared AWS infra — ECS cluster + ALB, API + Electric sync services

## Goal
Stand up a new, separate Pulumi (TypeScript) stack under `infra-aws/` provisioning one shared,
reusable ECS Fargate cluster + ALB on AWS, running two services: the post-anki API (new) and a
self-hosted Electric sync service (replaces the now-shut-down Electric Cloud). Does not touch the
existing `infra/` GCP stack or `.github/workflows/deploy.yml` — fully additive, parallel stack.

## Why Fargate, not Lambda
apps/api has fire-and-forget background work (card compile, curriculum create, lecture/study
material generation — handlers return 202 and keep working via `void fn().catch(...)`). Lambda
freezes the execution environment the instant the handler returns, silently killing that work. No
adapter library fixes this without a real re-architecture to a job queue. Fargate runs the existing
container unchanged. (Advisor-confirmed judgment call, logged per /autonomous.)

## Why one shared cluster+ALB
User's own ask: build this so a future second local-first app can plug in without rebuilding the
cluster/ALB — each new app adds its own ECS service + target group to the same cluster/ALB. Electric
itself stays one service per Postgres database (Electric's own documented limit — "Electric connects
to a single PostgreSQL database per instance"), so a future app on a *different* database needs its
own Electric service added the same way, not a rebuild.

## Resources (Pulumi TS, `@pulumi/aws`)
- VPC: reuse the account's **default VPC** and its public subnets — no new VPC, no NAT gateway
  (saves ~$30+/mo). Fargate tasks get `assignPublicIp: true`; access is controlled via security
  groups, not network isolation.
- One ECS cluster (Fargate, no EC2 capacity provider).
- One Application Load Balancer, public subnets, host-based routing:
  - `api.postanki-aws.<tbd>` → api target group → api service (container port 8030)
  - internal Electric port is **never** exposed via the ALB — API reaches it directly over the VPC.
- Two ECS services:
  - `api` — image built from the existing `apps/api/Dockerfile` (no changes needed, confirmed by
    local build+smoke-test), env vars for `DATABASE_URL` (Neon pooled), `OPENROUTER_API_KEY`,
    `API_SHARED_SECRET`, `ELECTRIC_SERVICE_URL` (points at the Electric service's internal DNS via
    AWS Cloud Map / ECS Service Connect).
  - `electric-sync` — `electricsql/electric:1.7.7` (same image/version already running on GCP),
    env `DATABASE_URL` = `ELECTRIC_DATABASE_URL` (Neon **direct**, non-pooled — required for logical
    replication), `ELECTRIC_SECRET`.
- Security groups: ALB SG allows 443/80 from the internet. API service SG allows traffic from ALB
  SG only. Electric service SG allows traffic from API service SG only — never public, never the ALB.
- Region: **us-east-1** — matches Neon's own endpoint region (`us-east-1.aws.neon.tech`), cuts
  cross-region DB latency vs. the GCP deployment's `europe-west1`.
- Secrets: Pulumi encrypted config (`pulumi config set --secret`), same convention as the existing
  `infra/Pulumi.prod.yaml` — no new secrets-management service for a single-user app.
- Route53: new record under the existing `ilya.online` hosted zone, added only once the stack is
  confirmed healthy (separate todo item, after deploy).

## Non-goals
- No RDS — Neon stays the database for both apps, unchanged.
- No multi-AZ/high-availability hardening — single-user, cost over resilience for now.
- No AWS Secrets Manager / Parameter Store — Pulumi's own encrypted config is enough at this scale.
- No CI/CD wiring yet — first deploy is manual (`pulumi up` from this machine), matching the "AWS
  credentials needed" blocker already flagged.

## Rollback
Entirely additive — if this stack misbehaves, `pulumi destroy` on the new `infra-aws/` stack alone,
zero impact on the live GCP deployment (`postanki.ilya.online` and friends keep running unchanged).

## Cost (honest, not "free")
ALB ~$16+/mo fixed, Fargate (~0.25 vCPU/0.5GB per service, 2 services) ~$9/mo each, small public-IPv4
charge per task. Real floor is roughly $35-45/mo once both services run 24/7 — reported to the user,
never framed as free.
