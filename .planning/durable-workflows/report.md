# Durable workflow options for post-anki (October 2026)

Scope: job orchestration only. Vector search is covered by a sibling report. Every claim is labelled **Fact** (read in this repo or at a cited source), **Assumption** (reasoning), or **To verify**. Third-party pricing pages often disagree; prices below are directional and must be checked on each vendor's own page before a purchase.

## 1. Business summary

**What you get from changing this:** a paste or a Regenerate click would no longer depend on one server process staying alive. If the server restarts mid-run, the run resumes by itself from the last finished chunk (no repeated model calls, no repeated cost). Every run leaves a permanent record: who started it, which input, which model, each step's result and time. You can cancel a run, and a double-click can no longer start two runs for the same source.

**Recommendation:** adopt **DBOS Transact (TypeScript)** inside the existing API process, using the Postgres you already have. It is a free library, needs no extra server, and maps almost one-to-one onto what the code already does by hand. Runner-up: **Inngest** (managed, Mastra has a first-party integration) if you prefer not to own the state tables. Do not adopt Temporal now: it brings a separate cluster or a $100+/month cloud plan for one app with small jobs.

**Suggested first step, before any migration:** measure how often runs actually get stuck today (see section 6). If it is rare, a smaller fix (a periodic stale-claim sweep) may be enough for now.

## 2. What the code does today

- **Fact:** `apps/api/src/knowledge-source/knowledge-source.controller.ts:29` starts the pipeline with `void kickKnowledgeBitPipeline()` after answering the request. The kick (`knowledge-bit-pipeline-kick.orchestrator.ts`) is an in-memory single-flight loop: one run at a time per process, a second kick queues exactly one follow-up.
- **Fact:** `detectKnowledgeBits` claims one source at a time in Postgres (`claim`), processes chunks (up to 3 concurrently), inserts items with a claim check, and calls `resetStale(15 minutes)` at the start of each run (`detect-knowledge-bits.orchestrator.ts:27, 287`).
- **Fact:** Regeneration (`knowledge-source-regeneration.controller.ts`) claims the source, replies 202, then runs `generateItemsForSource(...)` fire-and-forget.
- **Fact:** `schema.ts` has 17 columns of the shape `*_claimed_at`, `*_claim_token`, `*_attempts`, `*_failed_at` that implement leasing, retry counting and failure marks by hand, per generation stage.
- **Fact:** The generic Cloud Run service in `infra/index.ts:128-146` sets `minScale 0` and `maxScale 1` and has no `cpu-throttling: false` annotation; only the Electric service sets it (`infra/index.ts:217`).
- **Fact:** `.planning/TODO.md` (aws-electric-fargate-deploy) plans moving the API to ECS Fargate, which is always-on.

### Weak points, ranked by user-visible symptom
1. **A run can silently stop and stay "processing".** Symptom: a pasted source never produces cards. Mechanism: work lives in a request-started promise; a restart, deploy or scale-to-zero kills it, and recovery only happens when someone triggers the next kick and 15 minutes have passed. **Assumption:** on Cloud Run with default request-based CPU the work after the 202 reply can also be slowed or frozen. **To verify** against the deployed revision.
2. **No run history.** There is `llm_call_events` (per model call) but no record of a whole run with its steps, inputs and outcome.
3. **Retries and cancellation are bespoke per stage.** Each new stage copies the claim/attempt columns.
4. **A restart repeats paid model calls** for chunks that already finished, because chunk results are not checkpointed.

## 3. Requirements used to score the options
Jobs of about 1 second to a few minutes; TypeScript with Mastra agents; Postgres (Neon prod, Docker local); personal-scale cost; reproducible (same recorded inputs and step results, versioned code); auditable (run history, exportable, tracing); per-run cancellation; low operational burden for one developer.

## 4. Comparison

| Option | Durability model | Reproducible / versioned | Audit trail | 1-min and long jobs | Hosting | Cost at your scale | Ops burden | Lock-in | Migration effort |
|---|---|---|---|---|---|---|---|---|---|
| **DBOS Transact (TS)** | Library checkpoints each step into Postgres; recovers incomplete workflows on restart | Workflow patching and versioning; step results recorded so replay skips finished work | OpenTelemetry, workflow table you can query, time-travel debugger, optional Conductor console | Both; durable queues with per-queue concurrency, bulk cancel/resume | Runs inside your API process; self-host only needed | Library free; Conductor Pro $99/month optional | Lowest (no server) | Low: code stays plain functions | Low to medium |
| Inngest | Hosted (or self-hosted) engine calls your functions step by step, memoizing step results | Step memoization; deploy versioning handled by engine | Run history in dashboard (free tier 7-day history per one review) | Sleeps up to 14 days; 1,000 steps and 4 MB per step limits | Managed cloud or Apache-2.0 self-host (needs Postgres, Redis optional) | Free tier about 50k step runs (sources disagree); paid from $20-75/month | Low managed, medium self-hosted | Medium: event/step model and an HTTP endpoint | Medium |
| Mastra workflows | Snapshots of step state in Mastra storage; suspend/resume | Snapshot per run; durability across crashes depends on engine/storage choice | Snapshots only unless you add tracing (repo already has Langfuse/OTel packages) | Fine for short flows; designed for suspend/resume | In-process; or Inngest-backed engine via `@mastra/inngest` | Free | Low | Low-medium: Mastra-specific | Medium |
| Temporal | Deterministic replay of workflow code from event history | Strongest: replay plus worker versioning | Event history, UI, exports | Excellent for both | Cloud (Essentials from $100/month, 1M actions) or self-host (server MIT, needs DB) | $100+/month cloud; self-host estimates $300-600/month (third-party) | High self-hosted, medium cloud | Medium (SDK model) | High |
| Restate | Single-binary runtime journals invocations; your code runs as handlers | Journal-based replay; versioned deployments | Journal, OpenTelemetry | Both | Self-host binary (BSL 1.1, source-available) or Restate Cloud | Free self-host; cloud free tier 50k actions per one listing | Medium (extra server) | Medium | Medium to high |
| Hatchet | Postgres-backed engine with workers | Retries per step, DAG workflows | Dashboard history | Both | Self-host (MIT/Apache per sources) or cloud | Cloud free 100k runs then $10 per 1M; Team $500/month (one source) | Medium | Medium | Medium |
| Trigger.dev | Managed isolated task runtime; self-host possible | Run history, versioned deploys | Dashboard | Long tasks up to hours | Managed or Apache-2.0 self-host (Docker, Postgres, Redis) | Free 10k runs; Pro $50/month (one review, v3-era) | Medium to high self-hosted | Medium-high (tasks run on their runtime) | Medium |
| Vercel Workflow DevKit | `"use workflow"` functions with a "world" backend; Postgres world exists | Event log per run | Read-only web UI, no built-in auth | Both | Vercel-managed or self-host with `@workflow/world-postgres` | Free on self-host | Medium; young project | Medium | Medium; **To verify** GA status and Node/Express fit |
| Cloudflare Workflows | Durable steps on Workers runtime | Step retries, sleeps up to 365 days | Dashboard | Both | Cloudflare only | Pay per step ($0.30 per 1M after free, one source) | Low | High; code must run on Workers, not your Node/Mastra process | High |
| AWS Step Functions | JSON state machine (ASL) calling Lambdas/services | Execution history per run | CloudWatch, X-Ray | Standard to 1 year; Express up to 5 min | AWS only | Standard $25 per 1M transitions, 4,000 free per month | Low | High | High (logic leaves your code) |
| Windmill | Job queue plus flow runner on Postgres | Flow versions in its UI | Run history (audit logging is paid in community edition per one source) | Both, ~50 ms overhead per job | Self-host (AGPL core, enterprise files) or cloud | Self-host free; cloud $10 per user | Medium; it is a whole platform | High | High |
| pg-boss / Graphile Worker | Postgres job queue: retries, cron, SKIP LOCKED | None for workflows; you write steps yourself | Job table only | Short jobs; no multi-step checkpointing | In process, Postgres only | Free | Lowest | Low | Low, but solves only leasing/retry, not checkpoints |
| BullMQ | Redis queue with flows | Limited | Redis state, needs tooling | Short to medium | Needs Redis | Free plus Redis | Medium (new datastore) | Medium | Medium |

### Notes per option
- **DBOS** documents workflow patching and versioning, bulk cancel/resume, durable queues with worker concurrency and OpenTelemetry. Python and TypeScript are its supported languages; version 2 of the TypeScript library is a lightweight rewrite that works with Express. Fits how this repo already works: Postgres as the source of truth. **To verify:** behavior of its system database on Neon (pooled vs direct connection, scale-to-zero wake-ups); no source found.
- **Inngest** is the least code to adopt if you want someone else to run the engine, and Mastra documents a mapping of each workflow and step to an Inngest function and step. Cost: a second vendor, your API must expose an HTTP endpoint the engine calls, and 50-100 ms overhead per step was reported.
- **Mastra workflows alone** give suspend/resume and run snapshots; the durable part comes from the storage you configure or from running them on Inngest. Using them without an engine would not fix the process-death problem by itself (**Assumption**).
- **Temporal** remains the most rigorous for replay and versioning but is the heaviest; for one app with jobs under a few minutes it is more machinery than the problem needs.
- **Plain queues** fix the "stuck processing" and retry-bookkeeping problems cheaply but do not checkpoint chunks, so a restart still repeats paid model calls.
- Neither Cloudflare Workflows nor Step Functions fits a Node API with Mastra agents without moving logic out of the process.

## 5. Recommendation and migration path

**Pick DBOS Transact.** Reasons: (1) it removes the hand-written claim/attempt columns without adding a server; (2) each model call becomes a recorded step, so a restart never repeats paid chunk calls and a run can be audited afterwards; (3) workflow patching gives a safe way to change prompts and validation without breaking runs already in flight; (4) queue concurrency and cancel/resume cover the "cost control and per-run cancellation" need; (5) license cost is zero.

Plan (each phase shippable on its own):
1. **Measure (no code risk).** Count sources stuck in processing and runs lost to restarts; confirm the Cloud Run CPU behavior. Decide whether this is worth doing now.
2. **Wrap extraction.** One workflow per source, started with a deterministic workflow id (source id plus generation number) so a double click cannot start two. One step per chunk (model call plus validation, returning the validated items); a final step does the existing claim-checked insert. Keep the current validation, guards and verbatim quote checks unchanged, they become step bodies.
3. **Regeneration and cancel.** Regeneration becomes the same workflow with a new generation number; the existing "superseded" state stays. Expose cancel from the review page.
4. **Retire claim columns** stage by stage once no code reads them; migrations only through the generated-migration path with a backup first.
5. **Later stages** (question, fill-blank, basic-card, embedding scans) become workflows or queue tasks on the same mechanism.

Audit view: the DBOS workflow table plus `llm_call_events`, linked by workflow id stored on the source row, answers who/what/when/which model per run.

**If you want zero new moving parts first:** add a periodic stale-claim sweep and keep the current design; revisit after the Fargate move.
**If you want a managed engine:** Inngest with `@mastra/inngest`, accepting a second vendor and an inbound endpoint.

## 6. To verify before committing
- DBOS system database on Neon (connection type, cold start) and exact current TypeScript SDK version and license text on its repository.
- Cloud Run CPU allocation on the deployed API revision, and whether the Fargate move happens first.
- Real prices on each vendor's own page (all figures above come from third-party or vendor pages that conflict with one another).
- Inngest limits (1,000 steps per function, 4 MB per step) against the largest source (up to 40 items per source).
- Vercel Workflow DevKit GA status and Express/Node fit.

## 7. Sources (all fetched through web search; several are third-party aggregators)
- DBOS pricing: https://www.dbos.dev/pricing
- DBOS TypeScript v2 announcement: https://dbos.dev/blog/dbos-transact-v2-typescript
- DBOS March 2026 enhancements (patching, queue listening): https://www.dbos.dev/blog/dbos-new-features-march-2026
- DBOS April 2026 enhancements (bulk cancel/resume): https://www.dbos.dev/blog/dbos-new-features-april-2026
- DBOS TypeScript CLI reference: https://docs.dbos.dev/typescript/reference/cli
- Inngest pricing explained (third party): https://automationatlas.io/answers/inngest-pricing-explained-2026/
- Inngest review (limits, self-hosting): https://automationatlas.io/answers/inngest-review-2026/
- Trigger.dev vs Inngest (third party): https://automationatlas.io/guides/trigger-dev-vs-inngest-2026-comparison/
- Trigger.dev self-hosting (third party): https://automationatlas.io/answers/can-you-self-host-trigger-dev-2026/
- Restate vs Temporal: https://restate.dev/vs/temporal
- Restate hosting overview: https://docs.restate.dev/hosting/overview.md
- Hatchet pricing (third party): https://automationatlas.io/answers/hatchet-pricing-explained-2026/
- Mastra suspend and resume: https://mastra.ai/docs/workflows/suspend-and-resume
- Mastra workflow snapshots: https://mastra.ai/docs/workflows/snapshots
- Mastra with Inngest: https://mastra.ai/docs/workflows/inngest-workflow
- Temporal pricing: https://temporal.io/pricing.md
- Temporal self-hosted cost (third party): https://automationatlas.io/answers/temporal-self-hosted-pricing-2026/
- Cloudflare Workflows docs: https://developers.cloudflare.com/workflows/
- Step Functions Standard vs Express: https://oneuptime.com/blog/post/2026-02-12-step-functions-standard-vs-express-workflows/markdown
- Step Functions pricing guide (third party): https://wring.co/blog/aws-step-functions-pricing-guide
- Workflow DevKit deploying: https://useworkflow.dev/docs/deploying
- Windmill pricing and self-hosting (third party): https://automationatlas.io/answers/windmill-pricing-explained-2026/
- Windmill repository: https://github.com/windmill-labs/windmill
- Node job queues comparison (third party): https://www.pkgpulse.com/guides/bullmq-vs-bee-queue-vs-pg-boss-job-queues-nodejs-2026
- Trigger.dev, pg-boss and Graphile Worker official docs were not retrieved; details for those rest on third-party summaries.

END-OF-REPORT
