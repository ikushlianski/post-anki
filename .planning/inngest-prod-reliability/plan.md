# Inngest works in prod

## Goal
- Every background job the API defines is known to Inngest Cloud after each deploy.
- Imported notes get extracted without anyone stepping in.
- The 1,255 notes stuck in "pending" since 2026-11-09 get processed.

## Facts (2026-11-10, from the orchestrator's prod checks; code facts re-verified)
- Inngest CLI is signed in. `inngest api --prod --env production get-apps` shows app `post-anki-api`, last synced 2026-11-09T18:56. The three later deploys did not re-sync it.
- `get-function-runs` showed 19 runs (`extract-knowledge-source`, `knowledge-bit-pipeline-kick`), last at 2026-11-09T22:56. No `import-anki-notes` runs.
- Prod DB: 1,255 `knowledge_sources` rows `status='pending'` with `import_key`, created 2026-11-09 18:58-19:05. One more row stuck in `processing` since 18:57.
- `.github/workflows/deploy.yml` step "Deploy API to Cloud Run" (~lines 283-346) sets `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `INNGEST_SERVE_ORIGIN` (`vars.PROD_API_PUBLIC_URL`, fallback `https://post-anki-api-pl6jw2mdla-ew.a.run.app`). The next step "Verify API health" only curls `/_healthz`. Nothing PUTs `/api/inngest` (served in `apps/api/src/api-server.ts:594` via `apps/api/src/shared/inngest-serve.ts`).
- Import flow: txt import sends `anki-import/requested` (`apps/api/src/txt-import/txt-import.controller.ts:26`) -> `import-anki-notes` (`apps/api/src/anki-import/anki-import-inngest.workflow.ts`) -> batch step -> `kickSourcesAfterAdd` (`apps/api/src/knowledge-source/knowledge-source-kick.ts`) -> `startDurableExtraction` (`apps/api/src/knowledge-bit/durable-extraction.starter.ts`). A failed launch or send is logged (`durable_extraction_launch_failed_left_for_sweep`, `extraction_enqueue_failed_left_for_sweep`) and the ids are left pending for the sweep. Kick errors are swallowed (`durable_extraction_start_failed`).
- Sweep: route `POST /knowledge-pipeline-sweeps` (`apps/api/src/router-table.ts:44`, `api-server.ts:732`) -> `pipeline-sweep.controller.ts` -> `runPipelineSweep` in `pipeline-sweep.orchestrator.ts`. Scheduler job `knowledgePipelineSweepJob` (`infra/index.ts:429-445`, `*/5 * * * *`, bearer `apiSharedSecret`, `https://${apiDomain}/knowledge-pipeline-sweeps`).
- Selection (`apps/api/src/knowledge-source/pending-sources.repo.ts`, `listStalePendingSourceIds`): `status='pending' AND updated_at < now-5min ORDER BY updated_at ASC, id ASC LIMIT 20`. It does NOT filter on `import_key`, so imported rows are not excluded by the filter itself.
- Event/workflow id is `${sourceId}:${updatedAt ms}` (`getKnowledgeSourceClaimToken`; `startExtractionWorkflow` sends it as the event `id`). The extraction function has `idempotency: "event.id"`, throttle 10/min burst 2, start timeout 30m (`extraction-inngest.limits.ts`, `extraction-inngest.workflow.ts`).
- The sweep never changes `updated_at` of rows it requeues. Claim for non-regeneration only checks `status='pending'` (`claimOrLoadSourceForExtraction`), not `updated_at`, so bumping `updated_at` is safe.

## Where the sweep can skip pending imported sources (hypotheses to confirm in step 2)
- H1 head-of-line blocking: the same 20 oldest rows are picked every tick. If their events are dropped (unsynced app, 24h event-id dedup, 30m start timeout under throttle) they stay pending and oldest, so rows 21-1255 are never reached.
- H2 same event id re-sent: unchanged `updated_at` means the same id `${sourceId}:${run}`, so Inngest dedups/idempotency-skips the re-send for 24h.
- H3 the scheduler job is not firing or gets non-200 (wrong `apiDomain` mapping, bad bearer), or `isDurable()` is false so the sweep only runs the in-process kick.

## Steps
1. **Deploy re-syncs Inngest** (`.github/workflows/deploy.yml`).
   - Add a step after "Verify API health": `curl -fsS -X PUT "<same origin as INNGEST_SERVE_ORIGIN>/api/inngest"` with a few retries. It must fail the job on non-2xx. Reuse the `vars.PROD_API_PUBLIC_URL || '<fallback>'` expression once, not a second copy of the literal.
   - Then check `inngest api --prod --env production get-apps` (or REST with the signing key) shows a sync time newer than the deploy start; fail otherwise. Skip this check if the CLI/key is unavailable in CI and say so in the commit; the PUT status is the gate.
2. **Confirm the cause (read-only, record answers in the commit body).**
   - `gcloud scheduler jobs describe post-anki-knowledge-pipeline-sweep --location <region> --project <PROD_PROJECT_ID>`: state, `lastAttemptTime`, status. Project/region come from the deploy vars and the Pulumi stack config.
   - `gcloud logging read` on service `post-anki-api`: requests to `/knowledge-pipeline-sweeps` since 2026-11-09 (status codes), plus the log names listed in Facts for 18:55-19:10.
   - `inngest api --prod --env production get-function-runs`: check paging; confirm 19 is the total.
3. **Drain prod: done by the orchestrator after deploy, not the implementer.** It triggers the sweep (or a one-off script like `apps/api/scripts/backfill-phrase-sentences.ts`, dry run by default). The `processing` row is failed by `reconcileDurableSources` only if its `failure_reason` starts with `durable:` and it is older than the stale threshold; otherwise the orchestrator handles it by hand.
4. **Fix the sweep's selection** (`pending-sources.repo.ts`, `pipeline-sweep.orchestrator.ts`; default for H1/H2, keep the `LIMIT 20` and 5-minute age):
   - Add a repo function that sets `updated_at = now()` for given ids WHERE `status='pending'`.
   - In `runPipelineSweep`, call it for the ids it just handed to `startExtraction` (the `started` ones). Do it before the next tick, not before `getClaim`, since the starter reads the claim itself. Effect: handled rows move to the back of the queue and the next tick gets a new event id and the next 20 rows.
   - Add the dependency to `PipelineSweepDeps` and `defaultDeps`.
5. **Warn when it happens again** (`pipeline-sweep.orchestrator.ts`, `pending-sources.repo.ts`). Add a count of pending sources older than 30 minutes. If the count is above 0, the sweep logs one `log.error({ count, oldestAgeMs }, "pending_sources_stuck")`. A failing count query is logged and never fails the sweep.
6. If step 2 shows H3 (scheduler not firing or non-200), fix the cause in `infra/index.ts` or the env, not the symptom, and say what was changed.

## Tests
- `apps/api/src/knowledge-bit/pipeline-sweep.orchestrator.test.ts` (existing, injected deps): started ids get bumped; deferred ids are not; a second tick with the bump deps selects different ids than the first; stuck-count above 0 logs one error; a count failure does not throw.
- `apps/api/src/knowledge-source/pending-sources.repo.integration.test.ts` (existing, DB suite, runs in CI only): a pending row with `import_key` is selected; the bump changes `updated_at` only for pending rows; a bumped row sorts after untouched older rows.
- Deploy step: no unit test; the PUT step is inline YAML. If put in a script file instead, test that it exits non-zero on a non-2xx answer.

## Done when
- A deploy ends with the PUT answered 2xx and the Inngest app sync time newer than the deploy start.
- Two consecutive sweep ticks with more than 20 pending rows send different source ids.
- A pending source older than 30 minutes produces one `pending_sources_stuck` error log per sweep.
- `npx tsc --noEmit` and lint pass; only touched test files run locally with `--maxWorkers=2`.

## Defaults chosen
- Fix H1/H2 with an `updated_at` bump: safe because the claim does not check `updated_at`; avoids a new column or schema migration.
- Keep batch size 20 and 5-minute cadence: concurrency/throttle limits stay as they are.
- Gate the deploy on the PUT status, not on the CLI check: CI may not carry an Inngest login.
- Drain stays with the orchestrator: it touches prod data.

## Out of scope
- Moving jobs off Inngest.
- Changing the Anki import's batching.

END-OF-REPORT
