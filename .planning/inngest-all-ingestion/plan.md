# Plan: all knowledge ingestion runs on Inngest in prod

Prod = Inngest Cloud free plan (no self-host). Local = dev server (`npm run inngest:dev`, UI localhost:8288, `INNGEST_DEV=1`).

## Business behavior
- Every way knowledge enters (web/Mac/iOS add, extension, MCP, Telegram, phrase/Notion import, long-paste split, Anki import, regenerate) saves the item first, then queues one Inngest job. Nothing is extracted inside the API process in prod.
- If queuing fails, the item stays "pending" (saved, visible). A 5-minute sweep re-queues it. No silent in-process fallback.
- After extraction, the follow-up passes (dedup, subject assignment, suggestions, embed, tag) run as one debounced Inngest job. Today they never run after a successful durable extraction (gap found).
- Idle cost is zero: the sweep only talks to Inngest when the DB shows pending work.

## Entry points (durable = flag on)
- Already Inngest: add text/URL/batch/split, extension, Telegram, MCP submit, phrase import, Notion phrase tick (all via `kickSourcesAfterAdd`); Anki import job; regenerate (except forceAtLeastOne).
- Must change: in-process fallback on send failure (kick, pipeline-kick starter, regeneration, background-job); regenerate with forceAtLeastOne (always in-process); `POST /knowledge-sources/notion` (no kick); manual item add (needlessly queues extraction); pipeline passes after extraction (never kicked); Cloud Scheduler scans (run in the request).
- Prod switch: flag unset today means in-process. Prod forces durable on and refuses to boot without keys.
- Out of scope (deferred): biz-education distill tick, facts/card embedding scans, Notion facts connector, course/curriculum/cards flags.

## Architecture boundaries (no new module kinds)
- Trigger: persist source (pending) -> `startDurableExtraction` sends `knowledge-source/extraction.requested` (id `sourceId:run`, idempotent resend).
- Starter result `fallbackIds` becomes `deferredIds`: left pending for the sweep (regeneration releases its owner mark first).
- Sweep: Cloud Scheduler stays the clock (one 5-min job to new `POST /knowledge-pipeline-sweeps`). It reconciles stale runs, re-queues pending sources older than 5 min (max 20), and sends the pipeline-kick event only if `hasPendingBitWork()` says so. Inngest cron rejected: ~8.6k empty runs per month per job.
- Kick job: passes minus `detect` (per-source extraction replaced it) plus embed, tag, basic_card, variant_embed; debounce 30s/2m.
- Extraction `finish` sends the kick event when items were inserted.
- DBOS removed (default engine is already Inngest): workflow, executor, dbos SQL, env vars, dependency.
- Non-prod with flags unset keeps the in-process path (e2e/playwright stacks have no Inngest). Prod cannot reach it.

## Execution budget (50k/month, run + each step)
- Lone short note: extraction 1+4 steps +1 send = 6; kick 1+9 = 10; ~16 total. Article, 3 chunks + summary: ~22.
- Normal use, 20 adds/day: ~10k/month (20%); bursts share kicks so less.
- Business import, 1,685 notes: import fn 88; extraction ~10.1k; kicks ~85 x 10 = 850; total ~11k (22%), ~16k if notes average 2 chunks.
- Throttle 10 extractions/min keeps the import at ~170 min and under the 5 concurrent steps limit.
- Rule: stay under 25k/month; check the Inngest usage page after the import.

## Risks
- Cap hit pauses runs, no fallback. Pending items wait; sweep keeps re-sending (deduped by event id 24h).
- Cloud Run request timeout 300s vs chunk deadline 10 min: a slow chunk step is cut and retried once.
- Operator steps (user): create Inngest Cloud app, add the two GitHub secrets, sync `https://<api domain>/api/inngest` after first deploy. Deploy now fails loudly if the secrets are missing.
- Mid-flight in-process claims at deploy time recover via 15-minute stale reset, then the sweep.

## Defaults chosen
- Inngest is the only engine in prod, DBOS deleted: dead code and a second DB schema are risk without use.
- Send failure = leave pending + sweep: item is already saved; retry is idempotent and cheap.
- Cloud Scheduler as clock, not Inngest cron: cron burns free-plan executions on empty ticks.
- Notion/biz ticks stay on Cloud Scheduler: they fetch and insert, no per-item LLM steps.
- Scan routes stay as manual operator routes, no longer scheduled.
- Local dev: `.env.local` `INNGEST_DEV=1` + flags; tests use fakes and `@inngest/test`, never the dev server.

## Open forks (recommendation in plan-report.md)
- Include embed/tag/variant/basic-card scans in Inngest now (recommended yes).
- Keep the non-prod in-process path (recommended yes, delete later).
- Move biz-education distill and facts embedding too (recommended later).

Units and parallel groups: see todo.md.
