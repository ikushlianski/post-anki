# Todo: all knowledge ingestion on Inngest

Plan: `plan.md`. Paths below are relative to `apps/api/src` unless they start with `.github`, `infra`, `docs`, `apps` or the repo root.
Builder rules: only run touched test files, `npx vitest run <files> --maxWorkers=2 --minWorkers=1`; integration files `--maxWorkers=1` with `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects`; never the full integration suite; then `npx tsc --noEmit` in `apps/api`. Co-located tests, `describe`/`it("should ...")`, business-scenario names. No `any`, files under 300 lines, no secrets, no push, no deploy.

Parallel groups (max 3 at once):
- Wave 1: U1, U2, U4
- Wave 2: U3, U5, U6
- Wave 3: U7, U8
- Wave 4: U9

## U1 Prod forces durable mode (keys required, deploy fails loudly)
Owns: `knowledge-bit/durable-extraction.flag.ts` (+ new `.test.ts`), `shared/durable-flags.ts`, `shared/env.ts` (durable refinements only), `shared/env.durable.test.ts`, `server.ts`, `.github/workflows/deploy.yml`
Depends on: none
- [ ] `isDurableExtractionEnabled(raw, nodeEnv)` and `isDurableBackgroundJobsEnabled` return true when `NODE_ENV === "production"`, else the existing flag parse.
- [ ] `shared/env.ts`: in production, require `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` (same messages as today) and reject `INNGEST_DEV=1`.
- [ ] `server.ts`: drop the "durable_jobs_disabled_in_production" warning for the two forced flags (keep it for cards and course jobs).
- [ ] `deploy.yml` "Deploy API to Cloud Run": fail the step with `::error::` when either Inngest secret is empty; always pass both keys; add `INNGEST_SERVE_ORIGIN` from the API public URL var (look for the existing API domain var; else `https://api.postanki.ilya.online`); keep `DURABLE_EXTRACTION=1`. Leave the rest untouched.
Tests:
- flag test: "should treat ingestion as durable in production even when the flag is unset", "should keep the flag opt-in outside production".
- env test: "should refuse to boot in production without the Inngest signing key", "... without the event key", "should refuse INNGEST_DEV in production", "should boot locally with INNGEST_DEV=1 and no keys".

## U2 Enqueue core: no in-process fallback when durable
Owns: `knowledge-source/knowledge-source-kick.ts` (+test), `knowledge-bit/durable-extraction.starter.ts` (+test), `knowledge-bit/pipeline-kick.starter.ts` (+test), `knowledge-bit/extraction-inngest.events.ts`, `knowledge-source/knowledge-source-item.controller.ts` (+test), `knowledge-source/notion-knowledge-source.controller.ts` (+test)
Depends on: none
- [ ] Starter: rename `StartResult.fallbackIds` to `deferredIds`. Failed send for a non-regeneration source: log `extraction_enqueue_failed_left_for_sweep`, leave the source pending, push to `deferredIds`. Regeneration: keep `releaseOwner` (back to pending) then defer. Unknown outcomes stay as today.
- [ ] Starter: launch/load failure returns all ids as `deferredIds` (no throw, no fallback).
- [ ] Starter: `startDurableExtraction` options accept `extras?: { forceAtLeastOne?: boolean; modelId?: string }`; `WorkflowAdapter.startExtractionWorkflow(input, run, extras?)` sends them as optional event fields; add them as optional to the schema in `extraction-inngest.events.ts`.
- [ ] `kickSourcesAfterAdd`: durable -> `startDurableExtraction` only; log deferred ids and errors; never call `startKnowledgeBitPipelineKick`. Not durable -> unchanged in-process kick.
- [ ] `startKnowledgeBitPipelineKick`: durable send failure logs `pipeline_kick_send_failed` and returns (no `kickInProcess`); not durable unchanged.
- [ ] `knowledge-source-item.controller.ts`: after a manual item insert call `startKnowledgeBitPipelineKick()` instead of `kickSourcesAfterAdd([id])`.
- [ ] `notion-knowledge-source.controller.ts`: after `insertKnowledgeSourcesFromNotion`, call `kickSourcesAfterAdd(created.map(id))` inside try/catch that only logs.
Tests:
- starter: "should leave a source pending for the sweep when Inngest rejects the send", "should release a regeneration's owner mark and defer it when the send fails", "should not report a source as deferred when the resend with the same id succeeds", "should pass forceAtLeastOne and modelId in the event".
- kick: "should never process a new source in the API process when durable is on and the send fails", "should still use the in-process kick when durable is off".
- pipeline-kick starter: "should swallow a failed send without running the passes in the API process".
- item controller: "should only request the follow-up passes after a manual item, not a new extraction".
- notion controller: "should queue extraction for the sources created from a Notion database".

## U3 Scheduled sweep endpoint (enqueue pending work, zero cost when idle)
Owns: new `knowledge-bit/pipeline-sweep.orchestrator.ts` (+test), new `knowledge-bit/pipeline-sweep.controller.ts` (+test), new `knowledge-source/pending-sources.repo.ts` (+ `.integration.test.ts`), `router-table.ts`, `router.ts`, `router.test.ts`, `api-server.ts` (one route case only)
Depends on: U2 (deferredIds), U4 (`hasPendingBitWork`)
- [ ] Repo `listStalePendingSourceIds(minAgeMs, limit)`: sources with status `pending`, `updatedAt` older than min age, oldest first.
- [ ] Orchestrator `runPipelineSweep()`: `reconcileDurableSources()`, then `startDurableExtraction(ids, { regeneration: false })` for up to 20 ids older than 5 min, then if `hasPendingBitWork()` send the pipeline-kick event. Returns `{ requeued, deferred, kickSent }`. Not durable (non-prod, flag off): run the existing in-process `kickKnowledgeBitPipeline`.
- [ ] Controller `handleSweepKnowledgePipeline`: JSON 200 with the result; error -> 502 `sweep_failed` like the scan handlers.
- [ ] Route `POST /knowledge-pipeline-sweeps` named `sweepKnowledgePipeline`; same bearer auth as the other scan routes.
Tests:
- orchestrator: "should do nothing and call Inngest zero times when nothing is pending", "should requeue a source whose first send failed", "should not touch a source added a minute ago", "should send one pipeline kick when bits still need embedding", "should fail stale runs before requeueing".
- repo integration: "should list only pending sources older than the cutoff, oldest first, up to the limit".
- controller: "should answer 502 when the sweep throws".
- router test: new route resolves, wrong method does not.

## U4 Follow-up pipeline passes and pending-work gate
Owns: `knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts` (+test), `knowledge-bit/pipeline-kick-inngest.workflow.ts` (+test), new `knowledge-bit/pipeline-pending-work.ts` (+test)
Depends on: none
- [ ] Add passes `embed`, `tag`, `basic_card`, `variant_embed` (existing orchestrator functions) to the pass list. Export `DURABLE_PIPELINE_PASSES` = all passes except `detect`; the Inngest function iterates that list. In-process kick keeps all passes.
- [ ] `PIPELINE_KICK_DEBOUNCE` becomes `{ period: "30s", timeout: "2m" }` so a throttled bulk import yields about one kick per two minutes.
- [ ] `hasPendingBitWork()`: `Promise.all` over the existing scan list functions with limit 1 (embedding, tagging, question generation, fill-blank, basic card, variant embedding); true if any returns a row. No new SQL unless a pass has no list function (then skip it).
Tests:
- passes: "should not extract sources inside the follow-up job" (no `detect`), "should still run the later passes when one pass fails".
- gate: "should report no work when every list is empty", "should report work when one list has a row".
- workflow (`@inngest/test`): "should run one step per durable pass", "should run a follow-up kick after a cancelled run".

## U5 Remove DBOS
Owns: `knowledge-bit/durable-extraction.workflow.ts`, `knowledge-bit/durable-extraction.workflow.integration.test.ts`, `knowledge-bit/durable-extraction.executor.test.ts`, `knowledge-bit/durable-extraction.reconcile.ts`, `knowledge-bit/knowledge-bit-read.repo.ts`, `knowledge-bit/knowledge-bit-source-durable.repo.ts`, `knowledge-bit/knowledge-bit.repo.ts` (re-exports), `shared/env.ts` (DBOS_* and ENGINE vars), `shared/env.durable.test.ts` (dbos cases), `apps/api/package.json`, `package-lock.json`, starter engine switch in `knowledge-bit/durable-extraction.starter.ts` (+test)
Depends on: U1, U2
- [ ] Delete the three DBOS files above; remove `durableWorkflowExists`, the `dbos.*` joins (keep the age-based path of `failProcessingSourcesWithEndedWorkflows`), `loadWorkflow` engine switch (always the Inngest adapter), `DURABLE_EXTRACTION_ENGINE`, `DBOS_APPLICATION_VERSION`, `DBOS_EXECUTOR_ID`, `shutdownDurableExtraction` if unused.
- [ ] `npm uninstall @dbos-inc/dbos-sdk -w @post-anki/api` (updates the lockfile). Grep for leftover `dbos` in `apps` and `infra`.
Tests:
- starter test: drop DBOS cases, keep "should use Inngest as the only engine".
- env test: "should ignore a leftover DURABLE_EXTRACTION_ENGINE value".
- reconcile: "should fail processing sources older than the stale cutoff" (age-based).

## U6 Extraction workflow: kick after finish, regeneration always durable
Owns: `knowledge-bit/extraction-inngest.workflow.ts` (+test), `knowledge-bit/extraction-inngest.steps.ts` (+test), `knowledge-bit/durable-extraction.steps.ts` (+test), `knowledge-source/knowledge-source-regeneration.controller.ts` (+test)
Depends on: U2 (event fields, starter extras)
- [ ] Workflow reads optional `forceAtLeastOne` and `modelId` from the event and passes them into the chunk write options (`WriteOptions.forceAtLeastOne` already exists); `modelId` goes through `chooseModelId`.
- [ ] After the `finish` step, when `inserted > 0`, `step.sendEvent("kick", pipelineKickRequestedEvent)` (one extra step; skipped on failed or empty runs).
- [ ] Regeneration controller: remove `generateInProcess` and the `forceAtLeastOne` bypass in durable mode: always `startDurableExtraction([id], { regeneration: true, extras })`; on `deferredIds` still reply 202 `running` (source is back to pending). Non-durable path unchanged.
Tests:
- workflow: "should queue the follow-up passes once after items were stored", "should not queue them when nothing was extracted", "should force at least one item when the regeneration asked for it".
- regeneration controller: "should extract a force-at-least-one regeneration through Inngest in prod", "should answer 202 and leave the source pending when the send fails", "should still answer 409 for a second regeneration while one runs".

## U7 Infra: one scheduler job replaces seven
Owns: `infra/index.ts` (+ any Pulumi config doc in `infra/`)
Depends on: U3
- [ ] Remove jobs and config vars for `knowledgeBitDetect`, `knowledgeBitEmbed`, `knowledgeBitTag`, `knowledgeBitQuestionGen`, `knowledgeBitFillBlankGen`, `knowledgeBitBasicCardGen`, `knowledgeBitVariantEmbed`. Add `knowledge-pipeline-sweep` every 5 minutes, POST `https://${apiDomain}/knowledge-pipeline-sweeps`, bearer `apiSharedSecret`, `attemptDeadline` 60s. Keep card-embedding (6h), biz-distill and notion tick unchanged.
- [ ] Update the comment block near line 34 about job counts. Do not run `pulumi`.
Tests: `npx tsc --noEmit -p infra` (or the infra type check script) only; no unit tests.

## U8 Source summary and bit variants: no in-process fallback
Owns: `background-job/background-job.starter.ts` (+test), `knowledge-source/knowledge-source-summary.starter.ts` (+test)
Depends on: U1
- [ ] In `startJob`, for kinds `article-summary` and `knowledge-bit-variants` a failed send logs `background_job_event_send_failed` and returns without running in-process; other kinds keep today's fallback.
Tests:
- "should skip an article summary and log when Inngest rejects the send", "should still run a lecture compile in-process when the send fails", "should run in-process when durable background jobs are off".

## U9 Docs and local-dev notes
Owns: `apps/api/README.md` (Inngest section), `apps/api/.env.example`, `docs/architecture/knowledge-bit/knowledge-bit-ingestion-pipeline.md`, `docs/architecture/knowledge-bit/durable-extraction.md`, `docs/architecture/paid-services.md` (row 14), `.planning/business-anki-import-mcp/runbook.md`
Depends on: U1-U8
- [ ] Present-tense docs: prod forces Inngest, send failure leaves items pending, the 5-minute sweep, the new follow-up job, budget numbers, DBOS gone, local dev (`INNGEST_DEV=1`, `DURABLE_EXTRACTION=1`, `DURABLE_BACKGROUND_JOBS=1`, `npm run inngest:dev`, UI localhost:8288, flags unset = in-process for e2e stacks).
- [ ] Paid-services row 14: Inngest Cloud free plan active in prod, 50k cap, runs pause at cap.
- [ ] Runbook: operator steps (Inngest Cloud app, two GitHub secrets, sync the URL after first deploy, check usage after the import).
Tests: none (docs).

## Manual smoke (user, after merge, local)
- [ ] `npm run inngest:dev`, API with `INNGEST_DEV=1` and flags: add a text item, see `extract-knowledge-source` then `knowledge-bit-pipeline-kick` in localhost:8288.
- [ ] Stop the dev server, add an item, restart it, call `POST /knowledge-pipeline-sweeps`: the item is extracted.
