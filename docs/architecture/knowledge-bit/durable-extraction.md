# Durable extraction (pilot)

## What it does

Extraction of a pasted source can run as a durable workflow on DBOS Transact, using the Postgres the app already uses. A workflow records each finished step in the database, so a crash of the API does not repeat finished model calls. The pilot is off by default. With the flag off nothing about extraction changes, and the DBOS package is not even loaded.

## Switching it on

- `DURABLE_EXTRACTION=1` (or `true`) in the API environment turns the pilot on. Any other value, an empty value or nothing keeps the in-memory pipeline; an odd value never stops the API from booting (the variables are plain optional strings in the environment schema and are parsed by the pilot code with fallbacks).
- `DBOS_APPLICATION_VERSION` pins the application version (see "Deploys"). Set it to the release id wherever the flag is on.
- `DBOS_EXECUTOR_ID` is optional. Left unset, every process gets its own unique executor id (host name, process id and a random suffix). Set it to a stable value only for a deployment with exactly one API instance, so that a restarted process resumes its own unfinished runs.
- `DURABLE_EXTRACTION_STALE_MS` (default 1800000, 30 minutes) is how long a run under another executor may show no progress (no step completed, no claim refresh) before its source is failed with `workflow_executor_lost`. Allowed range 20 minutes to 6 hours (the minimum is above the largest launch timeout of 5 minutes plus the 10-minute deadline of a chunk step, so a live run is never judged dead); empty, invalid or out-of-range values fall back to the default.
- `DURABLE_EXTRACTION_TIMEOUT_MS` (default 10000; allowed 1 s to 5 min, anything else falls back to it) bounds loading and launching the engine and starting a workflow. On a timeout the source goes to the old in-memory pipeline and an error is logged.
- DBOS keeps its state in its own `dbos` schema of the application database; no drizzle migration is involved.
- The engine launches lazily on the first extraction after the API starts. If the launch or a start fails or times out, the source falls back to the old pipeline, so no source is lost.

## What runs

- One workflow per source run. The workflow id is `<source id>:<extraction run>` (`knowledge_sources.extraction_run`, incremented by a regeneration). Starting the same id twice, for example a double click on Regenerate, is a no-op.
- Steps: `claim`, `plan`, one `chunk-N` per chunk (no engine-level retry, the model wrapper already retries), `finish`, and `guard` when anything unexpected throws. A failed chunk does not stop the others: the items of the chunks that worked are kept and the source is marked failed with the first failure reason, as in the old path.
- Chunks run one after another in the pilot; the old path runs three at a time.
- New sources and the regeneration route start the workflow when the flag is on; both stay on the old path when it is off.

## Claim and replay

The `claim` step moves a pending source to "processing" and writes its owner, `durable:<workflow id>`, into `knowledge_sources.failure_reason` (empty for a processing source otherwise; `finish` and `fail` overwrite it). If the process dies after the claim is written but before the engine records the step, the re-run finds the source already owned by the same workflow id and continues with the same claim time. A different workflow id never takes it over. A regeneration claims the source itself and the workflow loads it.

## Failures end in a failed source, not a stuck one

- Any unexpected error in the workflow runs the `guard` step, which marks the source failed with a short reason code (for example `extraction_failed`; the full error is only logged), the same claim-checked write the old path uses; the workflow then ends in `ERROR`.
- A cancelled run, or a run the engine gave up on (`CANCELLED`, `ERROR`, `MAX_RECOVERY_ATTEMPTS_EXCEEDED`), cannot run a guard step. At every launch and every start, sources still in "processing" whose workflow has ended that way are marked failed (`workflow_cancelled`, `workflow_error`, ...). A run still `PENDING` under another executor id whose last progress (latest completed step, engine update or claim time) is older than `DURABLE_EXTRACTION_STALE_MS` is marked failed with `workflow_executor_lost`. A failed source can be regenerated.

### Progress, not a heartbeat on the claim
The claim token (`knowledge_sources.updated_at`) is checked by the steps that write results, so it is never refreshed while a run is going. Progress is read from the engine instead: every finished step records a completion time, and a chunk step is bounded: all model calls of one chunk (retries included) share a single 10-minute abort deadline. A long run therefore stays alive as long as steps keep completing within the cutoff. The legacy stale reset (15 minutes) skips sources owned by a durable run (`failure_reason` starting with `durable:`) until they are 6 hours old, so it cannot restart a running extraction; the 6-hour ceiling only exists to free sources stuck after the flag was turned off.

### Errors stored by the engine
Every step and the workflow throw a fresh plain error whose message is a short code (`extraction_failed`, `no_valid_items`, `source_empty`, `source_too_long`, `knowledge_source_reclaimed`, ...). Provider and database errors can carry the prompt or the response body, so the full error is logged by the application only and never reaches `dbos.operation_outputs` or `dbos.workflow_status`. The failure reason shown on the source is the same code.

### Regeneration ownership
A regeneration is claimed by the regenerate endpoint (status processing, run number + 1). Before starting the workflow the starter writes the owner marker `durable:<source id>:<run>` on that row; the claim step of a regeneration only loads a row carrying exactly that marker. The marker is written only if the row still has the run number and claim time the starter read. If the start fails or times out and the engine has no record of the workflow, the marker is dropped before the in-process fallback runs; so a late-created workflow finds no claim and skips instead of running next to the fallback. If the run number cannot be read, the source goes to the legacy path. If the existence check or the marker release itself fails, the outcome is unknown: no fallback runs, the source is reported as unknown and the scheduled reconcile settles it.

### Scheduled reconcile
The scheduled `detect-bits` job (every 5 minutes) runs the reconcile whenever any `durable:`-owned source is still processing, even if `DURABLE_EXTRACTION` was switched off meanwhile. It never launches the engine, only reads the engine tables (when they exist), and passes no executor id, so a run under any executor is judged by its progress alone: ended workflows, runs without progress for the stale cutoff under another executor, and `durable:`-owned rows older than the cutoff that have no engine record (or no engine tables at all) are failed (`workflow_record_missing`). A failing query is logged and retried on the next call. With no durable-owned rows it does nothing.

### Claim time
The claim time is written from the application clock (millisecond precision) and compared as a value, not against the database clock; the reconcile compares it with the database clock only against cutoffs of 20 minutes or more, so small clock skew does not matter.

### Claim step failure
If the claim write committed but the step then failed, a `release` step marks the source failed (only when it is still owned by this workflow), so it does not wait for a stale reset.

### Retry bound
Engine step retries are off. The workflow registration sets `maxRecoveryAttempts: 3`; after that the engine ends the run as `MAX_RECOVERY_ATTEMPTS_EXCEEDED` and the reconcile marks the source failed. Worst case model calls per source = chunks × 3 attempts in the retry wrapper (plus one quality retry, so up to 4 calls) × (1 + 3 recoveries). Example: 5 chunks gives at most 5 × 4 × 4 = 80 calls. Recovery only happens after a restart with a pinned `DBOS_EXECUTOR_ID`; a crash loop is therefore bounded by that limit. To stop a runaway run immediately, cancel it (see below).

## What the engine stores

- Workflow input: the source id and whether it is a regeneration.
- Step outputs: ids, the claim time, counts, the validated item drafts (statement, question, answer, kind and the verbatim quote, which are what gets inserted anyway) and failure reasons. Error texts are limited to 200 characters.
- Never stored by the engine: the source text, chunk text and the reviewer feedback text. Steps read them from the application tables and chunk step inputs are only the source id and the chunk number.
- Retention: the engine keeps every run until it is purged. Purge finished runs older than 30 days (`operation_outputs` has no cascade from `workflow_status`, so delete it first):

```sql
delete from dbos.operation_outputs
where workflow_uuid in (
  select workflow_uuid from dbos.workflow_status
  where name = 'extractSource'
    and status in ('SUCCESS', 'ERROR', 'CANCELLED')
    and created_at < (extract(epoch from now() - interval '30 days') * 1000)::bigint
);

delete from dbos.workflow_status
where name = 'extractSource'
  and status in ('SUCCESS', 'ERROR', 'CANCELLED')
  and created_at < (extract(epoch from now() - interval '30 days') * 1000)::bigint;
```

## Deploys

A workflow resumes only on an instance with the same application version. Keep `DBOS_APPLICATION_VERSION` unchanged across deploys that do not change step behavior. When step names or their input shapes change, change the version and let the old version finish or fail its running workflows first.

## Audit queries

Recent runs:

```sql
select workflow_uuid, status, executor_id, application_version, recovery_attempts,
       to_timestamp(created_at / 1000.0) as created, to_timestamp(updated_at / 1000.0) as updated
from dbos.workflow_status
where name = 'extractSource'
order by created_at desc
limit 20;
```

Steps of one run:

```sql
select function_id, function_name,
       completed_at_epoch_ms - started_at_epoch_ms as duration_ms, error
from dbos.operation_outputs
where workflow_uuid = '<source id>:<run>'
order by function_id;
```

Runs that are not finished:

```sql
select workflow_uuid, status, executor_id, to_timestamp(created_at / 1000.0) as created
from dbos.workflow_status
where name = 'extractSource' and status not in ('SUCCESS', 'ERROR', 'CANCELLED')
order by created_at;
```

## Cancelling a run

Call `DBOS.cancelWorkflow('<source id>:<run>')` from a Node process connected to the same database. The run stops at the next step boundary (a step already running is not interrupted). The next launch or start marks the source failed with `workflow_cancelled`; to do it at once:

```sql
update knowledge_sources set status = 'failed', failure_reason = 'workflow_cancelled' where id = '<source id>' and status = 'processing';
```

## Open points

- With a unique executor id per process, a restarted process does not resume the unfinished runs of the process that died; those sources end failed after the stale cutoff (30 minutes without progress) and are regenerated by hand. Pin `DBOS_EXECUTOR_ID` on a single-instance deployment to get resume-after-restart.
- Behavior with Neon's pooler and scale-to-zero is not verified.
