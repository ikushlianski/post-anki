# Durable extraction (Inngest)

## What it does
- Every way knowledge enters saves the source first (status `pending`), then sends one Inngest event `knowledge-source/extraction.requested` (id `<source id>:<run>`, so a resend is a no-op).
- In prod nothing is extracted inside the API process. Prod forces durable mode on and refuses to boot without `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` (or with `INNGEST_DEV=1`).
- Non-prod with the `DURABLE_*` flags unset keeps the in-process path (e2e and playwright stacks have no Inngest). Prod cannot reach it.
- DBOS is gone: no workflow engine on Postgres, no `dbos` schema, no `DBOS_*` or `DURABLE_EXTRACTION_ENGINE` variables.

## Send failure
- A failed send leaves the source `pending` (saved and visible). No in-process fallback, also for regeneration, article summaries and bit variants.
- The starter reports such ids as `deferredIds`; a regeneration releases its owner mark first.
- The sweep re-queues them (below).

## Functions
- `extract-knowledge-source`: steps `claim`, `plan`, one `chunk-N` per chunk, `finish`, plus `guard`/`release` on failure. Throttled to 10 extractions per minute; singleton per source id.
- `finish` sends `knowledge-bit/pipeline-kick.requested` when items were inserted.
- `knowledge-bit-pipeline-kick`: the follow-up passes (wh-question, fill-blank, basic card, embed, variant embed, tag, card dedup, subject assignment, subject suggestions) as one debounced job (30 s, max 2 min). Many extractions in a burst share one kick.
- `handle-extraction-cancel`: fails sources whose run was cancelled or timed out.
- `import-anki-notes`: see the ingestion pipeline doc.

## Sweep
- Cloud Scheduler calls `POST /knowledge-pipeline-sweeps` every 5 minutes (bearer-authed like the other scheduler routes).
- It reconciles stale runs, re-queues pending sources older than 5 minutes (max 20), and sends the kick event only when the database shows pending bit work. Idle cost is zero: no Inngest call without pending work.
- Sends are deduped by event id for 24 h, so repeated sweeps are safe.
- Interrupted in-process claims recover through the 15-minute stale reset, then the sweep.

## Switches
- `DURABLE_EXTRACTION`, `DURABLE_CARDS`, `DURABLE_COURSE_JOBS`, `DURABLE_BACKGROUND_JOBS` (`1`): forced on in prod; in dev they pick which work runs on the dev server.
- `DURABLE_EXTRACTION_STALE_MS` (default 30 min, 20 min to 6 h): run without progress before its source is failed `workflow_executor_lost`.
- `DURABLE_EXTRACTION_TIMEOUT_MS` (default 10 s, 1 s to 5 min): bound on starting a run.

## Free-plan budget (50k executions per month, run plus each step)
- Lone short note: extraction 6 + kick 10, about 16. Article with 3 chunks and a summary: about 22.
- Normal use, 20 adds a day: about 10k a month (20%). Bursts share kicks, so less.
- Business import of 1,685 notes: about 11k (22%); about 16k if notes average 2 chunks.
- Stay under 25k a month; check the Inngest usage page after the import. At the cap runs pause; pending items wait and the sweep keeps re-sending.
- Cloud Run request timeout is 300 s and a chunk deadline is 10 min: a slow chunk step is cut and retried once.

## Local development
- `npm run inngest:dev`, UI at http://localhost:8288, API with `INNGEST_DEV=1`. Setup is in `apps/api/README.md`.
