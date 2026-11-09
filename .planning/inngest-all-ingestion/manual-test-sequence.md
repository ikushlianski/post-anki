# Manual test sequence: all ingestion on Inngest

No confirmed scenarios, built from the brief

Contract: `brief.md` plus U1-U9 in `units.md`. Everything runs on localhost.

## Start the local environment

Nothing was started or checked while writing this file. Before running, confirm each port is free or owned by this project (`lsof -i :<port> -sTCP:LISTEN`), and reuse anything already healthy.

```bash
# Inngest dev server (UI http://localhost:8288)
npm run inngest:dev
# API on 5560 with the durable flags and the local Inngest server (apps/api/.env.local)
#   INNGEST_DEV=1  DURABLE_EXTRACTION=1  DURABLE_BACKGROUND_JOBS=1  PORT=5560
npm run dev:api
# Web on 5540
npm run dev:web
curl -s http://localhost:5560/_healthz
```

Open http://localhost:5540 and http://localhost:8288 side by side. Ports shown are the repo defaults (`apps/api/.env.example`, `apps/web/package.json`); no registry entry was written.

## Example rows

Newest source, picked by `created_at` descending (fetches the row the steps compare against):

```sql
select id, status, created_at, updated_at from knowledge_sources order by created_at desc limit 1;
```

Newest still-pending source, picked by `updated_at` descending:

```sql
select id, status, updated_at from knowledge_sources where status = 'pending' order by updated_at desc limit 1;
```

## Group 1: read-only

1. Action: open http://localhost:8288, Functions tab. Expect: the extraction function and one follow-up (pipeline kick) function are registered; no DBOS-related function or page.
2. Action: open http://localhost:5540/sources. Expect: the list loads and shows each source's status.

## Group 2: reversible

3. Action: on http://localhost:5540/add-knowledge paste a short note and submit. Expect: the item appears at once as saved; in the Inngest UI Runs tab one extraction run starts for it.
4. Action: wait for that run to finish. Expect: the source leaves "pending", bits appear on /sources, and about 30 seconds to 2 minutes later one follow-up run appears (dedup, subject, embed, tag), not one per bit.
5. Action: add three short notes within 10 seconds. Expect: three extraction runs but a single follow-up run after they finish (debounce).
6. Action: add a manual item on /knowledge (Add item). Expect: no extraction run is started; only a follow-up run appears.
7. Action: on /notion-sources add a Notion source. Expect: an extraction run starts for the created sources.

## Group 3: failure and recovery

8. Action: stop the Inngest dev server, then add a note on /add-knowledge. Expect: the note is saved and stays "pending" on /sources; the page shows no error and the API did not extract it itself.
9. Action: start Inngest again and wait up to 5 minutes. Expect: the pending note gets an extraction run and finishes (the sweep re-queues it).
10. Action: with Inngest stopped, regenerate an existing source from its page. Expect: it goes back to "pending", not processed in the API; after Inngest restarts it is re-queued and regenerates.

## Not verifiable through the product UI

- Sweep endpoint `POST /knowledge-pipeline-sweeps` (bearer auth, returns `{ requeued, deferred, kickSent }`, zero Inngest calls when idle): `curl -X POST http://localhost:5560/knowledge-pipeline-sweeps -H "Authorization: Bearer $TOKEN"`; covered by the sweep orchestrator and router tests (U3).
- Production refuses to boot without `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY`, and rejects `INNGEST_DEV=1`: run `NODE_ENV=production` API start with keys unset; covered by `shared/env.durable.test.ts` (U1).
- DBOS removed: `grep -ri dbos apps infra` returns nothing and the DBOS dependency is absent from `apps/api/package.json` (U5).
- Scheduler consolidation (one sweep job replaces seven scan jobs) is defined in infra code and can be checked there only (U7).
- No in-process fallback for article summaries and variants: stop Inngest, trigger them, confirm nothing runs in the API; covered by U8 tests.
- Not testable locally: the real Cloud Scheduler 5-minute cadence and Inngest Cloud execution quota usage.

## Data gap check

No gaps found: existing data covers every scenario. Not checked against a live database (file-only run); the two queries above fetch the example rows.
