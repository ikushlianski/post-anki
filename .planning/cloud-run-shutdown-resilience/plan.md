---
type: plan
state: draft
updated: 2026-10-25
---
# Cloud Run shutdown resilience: plan

## Goal
The API loses no work when Cloud Run stops an instance or Neon drops a connection, on prod (`main`) and `dev` branches: it drains requests on SIGTERM, hands all background work to Inngest, and retries a query once on a dead connection.

## Approach
No new module boundary beyond `research.md`. All background work already funnels through `shared/background-dispatch.ts`: flag on means the request awaits the dispatch, flag off means the work runs detached with no CPU after the reply. So the fix is "all flags on in prod" plus two small code gaps, not new engines. Inngest is the one engine; the DBOS engine runs inside the API process and would stall the same way.

Inventory (apps/api/src), each with its verdict:
- `curriculum/curriculum-structure.ts`: the `.catch` calls at :159, :393, :529 sit inside awaited work, nothing to do. `confirmStructure` cards fan-out (:698) is covered by DURABLE_CARDS.
- `curriculum/source-candidates.ts`: awaited `Promise.all`; it runs inside the durable research steps, nothing to do.
- `knowledge-source/knowledge-source-regeneration.controller.ts`: covered by DURABLE_EXTRACTION (engine must be `inngest`).
- `cards/cards-fanout.orchestrator.ts`, `cards/cards-compile.orchestrator.ts` (via `cards.starter.ts` `runDetached`): covered by DURABLE_CARDS; the in-process fallback stays detached when the flag is off or the event send fails.
- `curriculum/curriculum.controller.ts` + curriculum starters, `domain-recommendation`: covered by DURABLE_COURSE_JOBS.
- `knowledge-source/knowledge-source-kick.ts` and pipeline kick: covered by DURABLE_EXTRACTION.
- `lecture/lecture.controller.ts` (also study-material, variants, summary, probe, learning-list approval): routed by `background-job/background-job.starter.ts` under a fourth flag, DURABLE_BACKGROUND_JOBS, which is not in `shared/env.ts` and not in its signing-key rule. Needs wiring.
- `knowledge-bit/knowledge-bit-review.controller.ts:59`: `void recordActivityToday(...)` after `sendJson`; other callers await it. Await it before the reply (try/catch, log only).
- `topic/topic.controller.ts:101` and `learning-list/learning-list-fold-in.orchestrator.ts:92`: already awaited; nothing to do.
- `notion-connector/notion-sync.orchestrator.ts`: only called by `apps/api/scripts/notion-sync.ts`, which awaits it; not an API path.
- `mcp/mcp.route.ts` and `shared/spend-guard.ts`: `void` on cleanup or logging only; leave.

## Steps
Dispatch A (shutdown, db, review controller). Owns: `src/server.ts`, `src/shared/graceful-shutdown.ts` + test, `src/db/client.ts`, `src/db/connection-retry.ts` + test, `src/knowledge-bit/knowledge-bit-review.controller.ts`, `src/knowledge-bit/knowledge-bit-review.route.test.ts`.
1. `shared/graceful-shutdown.ts`: `createGracefulShutdown({ server, flush, closeDb, drainMs = 8000, cleanupMs = 1500, exit })` returns `shutdown(signal)`. Idempotent. Calls `server.close()` and `closeIdleConnections()`, waits for close or the drain timer, then `closeAllConnections()`. Then `flushTracing()` and `closeDb()`, each in try/catch and capped by the cleanup timer, then `exit(0)`. Worst case is 9.5 s of the 10 s window.
2. `server.ts`: replace the inline handler with the factory; keep the SIGTERM and SIGINT wiring. Log `durable_jobs_disabled_in_production` at boot when NODE_ENV is production and any of the four flags is off.
3. `db/connection-retry.ts`: `isConnectionLevelError(err)` (pg code 57P01, 57P02, 57P03, or ECONNRESET, EPIPE, "Connection terminated unexpectedly") and `retryOnceOnConnectionError(fn)`.
4. `db/client.ts`: a `pg.Pool` subclass whose `query` goes through the retry helper. This fits drizzle: `drizzle-orm/node-postgres/session.js` runs every non-transaction statement through `pool.query` (:80, :89, :106) and transactions through `pool.connect()`, so transactions are never retried and a half-done transaction is never replayed. One `as` cast through the pool method type is allowed; if it needs `any`, stop and skip retry (report it).
5. Review controller: move `await recordActivityToday(...)` (wrapped in try/catch with the existing warn log) before `sendJson`.

Dispatch B (durable engine in prod). Owns: `src/shared/env.ts`, `src/shared/env.durable.test.ts`, `src/shared/durable-flags.ts` + test, `.env.example`, `apps/api/README.md`, `.github/workflows/deploy.yml`.
6. `env.ts`: add `DURABLE_BACKGROUND_JOBS` (plain optional string like the others) and count it in `durableOn`. Outside `INNGEST_DEV=1`, also require `INNGEST_EVENT_KEY` when any flag is on (without it every send fails and silently falls back to the stalled in-process path). Change the `DURABLE_EXTRACTION_ENGINE` default from `dbos` to `inngest`. Error messages name keys only, never values.
7. `durable-flags.ts`: export `listDisabledDurableFlags()` used by step 2.
8. `deploy.yml` "Deploy API to Cloud Run": add `--set-env-vars` for `DURABLE_EXTRACTION=1`, `DURABLE_CARDS=1`, `DURABLE_COURSE_JOBS=1`, `DURABLE_BACKGROUND_JOBS=1`, `DURABLE_EXTRACTION_ENGINE=inngest`, `INNGEST_EVENT_KEY=${{ secrets.PROD_INNGEST_EVENT_KEY }}`, `INNGEST_SIGNING_KEY=${{ secrets.PROD_INNGEST_SIGNING_KEY }}`. Resolve the API's own URL with `gcloud run services describe post-anki-api` (same pattern as WEB_ORIGIN, set only when non-empty) and pass `INNGEST_SERVE_ORIGIN`, because Cloud Run is not named in Inngest's docs and the origin is only auto-inferred from request headers. Never set `INNGEST_DEV` or `INNGEST_BASE_URL` in prod. Keep `--max-instances 1` and `--timeout 300s`; each step is one request, so a step must finish inside 300 s.
9. `.env.example` and README: document `DURABLE_BACKGROUND_JOBS`, `INNGEST_EVENT_KEY`, `INNGEST_SERVE_ORIGIN`, and the dev recipe (below).

Dev parity (no code beyond step 9): `.env.local` points `DATABASE_URL` at the Neon `dev` branch; set `INNGEST_DEV=1` and the four flags to 1; run `npm run inngest:dev` (Docker, calls `http://host.docker.internal:5560/api/inngest`). No keys needed in dev. The Neon `dev` branch gets the same pool retry as prod because both paths share `db/client.ts`.

## Owner steps [blocked: user]
- [blocked: user] Create an Inngest account and an app (free plan, $0, 50k executions a month, pauses at quota); copy the production Event key and Signing key.
- [blocked: user] Add GitHub environment `prod` secrets `PROD_INNGEST_EVENT_KEY` and `PROD_INNGEST_SIGNING_KEY`. The deploy must not merge before these exist: with flags on and no keys the API refuses to boot (by design).
- [blocked: user] After the deploy, sync the app in the Inngest dashboard with `https://<post-anki-api URL>/api/inngest` (or `PUT` to it); the serve endpoint is already outside the shared-secret check and is protected by the signing key.

## Tests (vitest, co-located)
- `graceful-shutdown.test.ts` (fake timers, fake server): in-flight request finishes before the database closes; a request still open at 8 s is force-closed and cleanup still runs; a second SIGTERM does nothing; a tracing flush that fails or hangs does not block exit.
- `connection-retry.test.ts`: a 57P01 or reset query succeeds on the second attempt; a unique violation (23505) is not retried; a second connection failure surfaces; a transaction client is not wrapped.
- `env.durable.test.ts`: background-jobs flag alone demands the signing key; event key demanded outside dev; default engine is `inngest`; `INNGEST_DEV=1` boots with none. `durable-flags.test.ts`: lists exactly the off flags.
- `knowledge-bit-review.route.test.ts`: the reply is sent after the streak write; a failing streak write still returns 201.
- Not unit-testable: `server.ts` wiring (covered by the manual SIGTERM check below).

## Done when
- SIGTERM with a slow request in flight lets it finish (up to 8 s), then exits 0 before 10 s.
- No `void` or detached work remains on an API request path when the four flags are on; the inventory above is the checklist.
- A forced Neon connection kill is invisible to the caller for a plain query.
- `npx tsc --noEmit`, project lint and `npx vitest run` in `apps/api` pass.
- Cannot be verified without the owner's Inngest account: Cloud reaching the Cloud Run URL, signature check, a real stopped-instance retry, `INNGEST_SERVE_ORIGIN` correctness, step duration against the 300 s limit.

## Defaults chosen
- One engine, Inngest, default changed from `dbos`: DBOS runs inside the API process, which loses CPU after the reply.
- Retry only `pool.query`, once: transactions can be half-applied, and one retry covers a Neon suspend without a retry storm.
- Drain 8 s, cleanup 1.5 s: fits the fixed 10 s SIGTERM window with margin.
- Require the event key as well as the signing key: a missing event key would hide as a silent in-process fallback.
- Keep flag-off paths detached: local dev and tests keep their current behavior; a boot log warns in prod instead of failing.
- Secrets passed as env vars via GitHub secrets: matches the existing deploy workflow.
