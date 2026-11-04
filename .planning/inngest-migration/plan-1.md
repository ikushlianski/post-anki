# Inngest migration plan 1: tool comparison, then moving durable extraction off DBOS
Fact = cites a source [Sn] below. Unlabelled claims are Assumptions (A). Local dev only: no cloud, no secrets, nothing implemented.

## Goal
Run source extraction as an Inngest function on the local dev server with the same guarantees as the DBOS pilot, then retire DBOS.

## Part 1: comparison (one Node/TS API, Postgres, LLM jobs of seconds to about 10 min)
| Tool | Durability, retries, cancel | Local dev | Infra, hosting, licence | Concurrency, UI, lock-in |
|---|---|---|---|---|
| Inngest | Engine calls your HTTP endpoint step by step, steps memoized; retries 0-20, default 4; `cancelOn` up to 5 events, a running step is not stopped [S2,S3] | `inngest dev` or Docker, UI :8288, in-memory, no keys locally [S1] | Self-host: SQLite + embedded Redis default, Postgres/Redis optional, single-node mode beta [S4]; SDK Apache-2.0, server licence sources conflict [S5]; Cloud free-tier figures conflict and the stack doc rejects Cloud on cost [S6] | Keyed concurrency, event-id idempotency 24h [S7]; limits 1000 steps, 4MB per step, 2h step [S8]; run UI; medium lock-in (A) |
| Temporal | Replay of deterministic workflow code from history (A) | `temporal server start-dev`, one process, SQLite, UI :8233 [S9] | Server MIT [S9]; prod needs SQL DB, plus Elasticsearch/Cassandra per a third party [S10]; Cloud about $100/mo [S6] | Strong UI; determinism rules = highest learning cost (A) |
| DBOS (have) | Steps checkpointed in Postgres `dbos` schema; spike verified resume after SIGKILL, duplicate start no-op, cancel at step boundary [S11] | None, runs inside the API process [S11] | Postgres only, no server; licence not re-checked | Queue concurrency; UI only via SQL or paid console [S11]; low lock-in; deploys need version pinning [S11] |
| Restate | Journaled handlers on a single-binary runtime (A) | One binary (A) | Extra server, BSL 1.1 (A, unverified); TS SDK client MIT [S12] | Per-key serialisation via virtual objects (A); medium lock-in |
| Hatchet | Postgres-backed engine, workers re-run on crash [S13] | Compose or Lite image [S13] | Postgres only; MIT vs Apache-2.0 sources conflict [S13] | Per-key concurrency and rate limits, dashboard [S13] |
Trigger.dev skipped: it is a hosted task runtime, a worse fit for an existing Node API (A).
Sources: S1 inngest.com/docs/local-development; S2 inngest.com/docs/reference/functions/create; S3 inngest.com/docs/features/inngest-functions/cancellation; S4 inngest.com/docs/self-hosting; S5 npm `inngest` (Apache-2.0, via depscope) and a Homebrew formula (server Apache-2.0), repo LICENSE not read; S6 ai-dev/docs/architecture/TECH-STACK-BY-PROJECT.md lines 135, 208, 228; S7 inngest.com/docs/guides/concurrency and /guides/handling-idempotency; S8 inngest.com/docs/usage-limits/inngest; S9 docs.temporal.io/dev-guide/typescript/project-setup; S10 automationatlas.io/answers/how-to-deploy-temporal-self-hosted-2026; S11 post-anki/.planning/durable-workflows/spike.md; S12 .planning/durable-workflows/report.md and jsdelivr.com/package/npm/@restatedev/restate-sdk-clients; S13 mintlify.com/hatchet-dev/hatchet.

**Recommendation for this project**
1. Fact [S11]: DBOS already survives restarts with no extra process and has 20 integration cases; switch only if you want the event model, a run UI, or one engine shared with business-analyzer (stack doc plans self-hosted Inngest there [S6]).
2. Inngest fits: one HTTP endpoint on the existing `node:http` server, free dev server, keyed concurrency, cancel events.
3. Never Inngest Cloud (stack-doc cost rule [S6]); dev server or self-host only. Temporal: no, too heavy for one app. Restate/Hatchet: no gain at this size, each adds a server (A).
4. Nothing is clearly better than both: DBOS wins on operations, Inngest on visibility and events.
5. Proceed with Inngest as asked, DBOS kept until parity.

## Approach (Part 2)
`durable-extraction.steps.ts` (no DBOS import) is reused unchanged: claim, plan, chunk-N, finish, fail map 1:1 onto `step.run`. New adapter `extraction-inngest.workflow.ts` exports the same four functions as `durable-extraction.workflow.ts`, so the starter, flag, config, claim/owner markers (`durable:<sourceId>:<run>`) and scheduled reconcile stay. Event `knowledge-source/extraction.requested` {sourceId, run, regeneration} (id = `<sourceId>:<run>`); cancel event `knowledge-source/extraction.cancel-requested`. Only run ids and flags travel in events; text stays in app tables.
Chunk outcomes return as values `{ok, drafts|reason}` (no engine retry, parity with `retriesAllowed:false`); function retries 3 cover only crashes. Error text stays redacted via `safeFailureReason`.

## Steps (units; A first, then B and C in parallel, D after both, E last)
A. Foundation. Files: `apps/api/package.json`, `package-lock.json`, `apps/api/src/shared/inngest-client.ts`, `inngest-serve.ts` (+test), `api-server.ts`, `shared/env.ts`, root `package.json`.
 1. Add `inngest` (proposed). Client id `post-anki-api`; env keys `INNGEST_DEV`, `INNGEST_BASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `DURABLE_EXTRACTION_ENGINE` as optional strings.
 2. Serve with `inngest/node` serve (a `RequestListener`); in `createApiServer` route `/api/inngest` right after `_healthz`, before the bearer gate (the SDK verifies signatures; unsigned only when `INNGEST_DEV` is set).
 3. Root script `inngest:dev`: Docker `inngest/inngest` (tag pinned at implementation), `inngest dev -u http://host.docker.internal:$PORT/api/inngest`, host port from `INNGEST_PORT` (default 8288).
B. Function. Files: `knowledge-bit/extraction-inngest.events.ts`, `.workflow.ts`, `.workflow.test.ts`.
 4. Function config: trigger event, `retries: 3`, `idempotency` on sourceId+run, `concurrency` [{limit: 2}, {key: sourceId, limit: 1}], `cancelOn` cancel event matched on sourceId and run, `onFailure`/cancelled hook calling `failSourceOwnedByWorkflow`.
 5. Body: `step.run("claim")` (null = skipped), `plan` (failed => `fail`), sequential `chunk-N`, `finish`, outer catch => `guard`/`release` steps; throw `NonRetriableError` with the short code. Do not let catch swallow SDK control flow.
 6. Adapter exports `launchDurableExtraction` (no-op), `reconcileEndedWorkflows` (calls app-DB reconcile), `startExtractionWorkflow` (`inngest.send` with event id), `shutdownDurableExtraction` (no-op).
C. Starter. Files: `durable-extraction.starter.ts` (+test).
 7. `loadWorkflow` picks the adapter by `DURABLE_EXTRACTION_ENGINE` (`dbos` default). Inngest `workflowExists` = resend the same event id: accepted => started, failed => false => release marker and legacy fallback (safe: the DB claim blocks a second run).
D. Reconcile. Files: `knowledge-bit.repo.ts` (+integration test).
 8. With no `dbos.*` tables the existing branch already fails `durable:`-owned rows older than `DURABLE_EXTRACTION_STALE_MS`; confirm it runs for Inngest rows and keep the 5-minute scheduled call in `detect-knowledge-bits.orchestrator.ts`. No new table or column.
E. Parity then cleanup (serial, only after sign-off). Files: delete `durable-extraction.workflow.ts`, `.executor.test.ts`, `.workflow.integration.test.ts`; edit `knowledge-bit.repo.ts` (drop `dbos.*` SQL, `durableWorkflowExists`), `server.ts`, `env.ts`, `apps/api/package.json` (remove `@dbos-inc/dbos-sdk`), `docs/architecture/knowledge-bit/durable-extraction.md`.
 9. Flip engine default to `inngest`, then delete DBOS and the `dbos` engine value; `DURABLE_EXTRACTION` stays default off.

## Tests
- Reused as is: `durable-extraction.steps.test.ts`, `.config.test.ts`, both controller `*.durable.test.ts`, `env.durable.test.ts`; `.starter.test.ts` gains Inngest-engine cases.
- Parity spec: port the 20 cases of `durable-extraction.workflow.integration.test.ts` to `extraction-inngest.workflow.integration.test.ts` (real Postgres lane, fake model, `@inngest/test` engine; it models no retries and does not run `onFailure` [S14], so cover those by unit-calling the hook).
- `inngest-serve.test.ts`: `/api/inngest` bypasses bearer auth, other routes do not.
- Manual smoke on the dev server (recorded in a report): kill the API mid-run, restart, run finishes without repeated chunk calls; cancel event fails the source.

## Done when
- With `DURABLE_EXTRACTION=1` and engine `inngest`, a pasted source and a regeneration extract through the dev server and match the DBOS outcomes.
- Duplicate start runs once; cancel leaves the source failed, not processing; stuck rows fail via reconcile.
- `npx tsc --noEmit`, lint and `npx vitest run` pass; engine tables hold no source text.
- After E: no `@dbos-inc` import or `dbos.` SQL remains.

## Defaults chosen
- One event with a `regeneration` flag, not two events: mirrors the existing `DurableExtractionInput`.
- Reuse the `durable:` owner prefix and run key: no data migration, legacy reset keeps working.
- Sequential chunks, global concurrency 2: parity with the pilot and a cap on model spend.
- Docker image for the dev server, not `inngest-cli` from npm: avoids a second dependency and install scripts (stack doc: scripts disabled).
- Reconcile stays app-DB only on the existing schedule: no progress heartbeat, so a run slower than the stale cutoff can be failed early (risk).
- Port 8288 is a default only; register an `inngest` role with devports by hand (outside this repo).

## Dependencies (proposed, not decided)
`inngest` (apps/api dependency); `@inngest/test` (apps/api devDependency, needs inngest >= 4 per its docs [S14]); Docker image `inngest/inngest`. Stack-doc conflicts: post-anki row says Mastra, no change, and lists no orchestrator; Inngest is sanctioned there only self-hosted and for business-analyzer [S6]. Check the `inngest` package has no install script.
S14 inngest.com/docs/reference/typescript/v4/testing and jsr.io/@inngest/test.

## Risks
- The DBOS pilot and the dirty files this touches (`api-server.ts`, `server.ts`, `env.ts`, `knowledge-bit.repo.ts`, both controllers, `package.json`, lockfile) are uncommitted: edit minimal hunks, never revert or stage others' changes; the owner commits the pilot first.
- Dev server state is in memory (S1): a restart loses runs; reconcile fails them after the cutoff. Persistence needs `inngest start` (beta, keys) (S4), to verify.
- Unsigned `/api/inngest` in dev mode while the API listens on all interfaces: any LAN host could start extractions. Set a signing key before any non-local use.
- Unverified: SDK v3 vs v4 API differences, `onFailure`/cancellation hook behaviour, `idempotency` expression syntax, dev-server timeout for a 10-minute step, per-step overhead (a third party reported 50-100 ms).
END-OF-REPORT
