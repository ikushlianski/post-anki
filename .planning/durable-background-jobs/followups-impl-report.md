# Durable background jobs: follow-ups implementation report

All paths under /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src.

## Item 1: a skipped regeneration never leaves its source stuck in processing

- Files: knowledge-bit/extraction-inngest.workflow.ts, knowledge-bit/extraction-inngest.config.test.ts, knowledge-bit/extraction-inngest.workflow.test.ts, knowledge-bit/knowledge-bit.repo.owner-marker.integration.test.ts.
- Choice: singleton `mode: "cancel"` (simplest; no new detection code). Fact: the installed inngest 4.23.0 types (node_modules/inngest/components/InngestFunction.d.ts:323-328) say `"cancel"` cancels the existing run and starts the new one, so the newer event is never silently skipped.
- Old-run safety (verified by test, not assumed): the cancelled old run emits `inngest/function.cancelled`; the handler calls `failSourceByEngineRunId(old run id)`, which matches only a `processing` row whose marker ends in `#<old run id>`. The regeneration's markOwner/claim already replaced the marker with the new owner, so nothing matches. onFailure does not fire on cancel, and a late onFailure uses `failSourceOwnedByWorkflow(id, "<id>:<oldRun>")`, which also does not match the new marker.
- Tests: extraction-inngest.config.test.ts 6 pass (singleton is now cancel); extraction-inngest.workflow.test.ts 8 pass (new: old-run cancel does not touch the :2 owner); owner-marker integration (Postgres) 6 pass (new: old run id and old workflow id fail nothing, new run id fails the row).
- Defaults: flag `DURABLE_EXTRACTION` unset still uses the legacy path, unchanged.
- Undone: not run against a real Inngest server. The assumption that `function.cancelled` is emitted for singleton-cancelled runs rests on the engine docs; if it is not emitted, the old run is simply gone and the new run owns the row, which is still safe.
- Citation: knowledge-bit/extraction-inngest.workflow.ts:60

## Item 2: a timed-out question-generation run queues one follow-up

- Files: knowledge-bit/pipeline-kick-inngest.workflow.ts, knowledge-bit/pipeline-kick-inngest.events.ts (optional `followUp` flag), knowledge-bit/pipeline-kick-inngest.workflow.test.ts, api-server.ts (registers the new function: one import entry and one array entry; this file is outside the stated touch list but registration is required).
- Behaviour: 30m timeouts, concurrency 1 and debounce are kept.
  - Failure (retries exhausted): onFailure sends one kick event with `followUp: true`, but only if the failed run's own event was not a follow-up. Exactly bounded.
  - Cancel (start or finish timeout): new function `knowledge-bit-pipeline-kick-follow-up` triggers on `inngest/function.cancelled` for the kick function id and sends one follow-up kick. The cancel event carries only function_id and run_id, so it cannot tell whether the cancelled run was a follow-up. Loop bound is instead `rateLimit { limit: 1, period: "1h" }` on that function: at most one cancel-triggered follow-up per hour, each needing a real 30m timeout first. This is a throttle, not a hard stop.
  - The follow-up passes through the existing debounce and concurrency 1, so it cannot overlap a running pass.
- Tests: pipeline-kick-inngest.workflow.test.ts 8 pass (4 existing, 4 new: failure sends one follow-up, a failed follow-up sends none, cancel sends one follow-up event, rate limit is 1/hour).
- Defaults: flag off means the in-process kick; none of this loads.
- Undone: hourly cap not exercised on a real server; a persistent timeout would still cause one extra kick per hour.
- Citation: knowledge-bit/pipeline-kick-inngest.workflow.ts:29

## Item 3: a provider 429 is retried by the engine only

- Files: mastra/generate-with-retry.ts (new option `retryRateLimit`, exported `isRateLimitError`), mastra/knowledge-bit-source-items.agent.ts (passes the option to the wrapper and sets Mastra `modelSettings.maxRetries: 0`), knowledge-bit/extraction-inngest.workflow.ts (durable `writeItems` passes `retryRateLimit: false`), tests in mastra/generate-with-retry.test.ts, mastra/knowledge-bit-source-items.agent.test.ts, knowledge-bit/extraction-inngest.workflow.test.ts.
- Behaviour: with `retryRateLimit: false` the wrapper rethrows a 429 (status/statusCode on the error or its cause chain) at once; non-429 errors are still retried (3 attempts). The existing chunk error mapping then turns it into RetryAfterError so the engine waits and retries once.
- Finding on hidden retries (Fact, from node_modules/@mastra/core/dist/chunk-2365SJTK.js around line 18996): Mastra's model loop wraps every model call in p-retry with `retries: modelSettings?.maxRetries ?? 2`, retrying retryable API errors (429 is retryable). The AI SDK type default for `maxRetries` is also 2 (node_modules/@mastra/core/dist/_types/@internal_ai-sdk-v5/dist/index.d.ts:477). So a 429 previously got up to 3 (Mastra) x 3 (wrapper) = 9 quick attempts, then the engine retry. The durable path now sets `modelSettings: { maxRetries: 0 }` explicitly, so a 429 is one attempt per engine run.
- Tests: generate-with-retry.test.ts 14 pass (4 new: default still retries 429, opt-out rethrows once, opt-out still retries a 500, cause-chain detection); knowledge-bit-source-items.agent.test.ts 54 pass (2 new: opt-out sets maxRetries 0 and the wrapper option, other callers untouched); extraction-inngest.workflow.test.ts includes a test that the durable path passes `retryRateLimit: false`.
- Defaults: option defaults to retrying 429; every other caller and the legacy path are unchanged, including Mastra's default of 2.
- Undone: a non-429 transient error on the durable path now has the wrapper's 3 attempts only, not Mastra's extra layer (fewer attempts than before, by design). Other agents were not changed.
- Citation: mastra/generate-with-retry.ts:109

## Runs (from apps/api)
- `npx vitest run src/mastra src/knowledge-bit/extraction-inngest src/knowledge-bit/pipeline-kick src/knowledge-bit/durable-extraction`: 29 files, 291 tests, all pass.
- Integration, `DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects npx vitest run --config vitest.integration.config.ts src/knowledge-bit/durable-extraction.workflow.integration.test.ts src/knowledge-bit/knowledge-bit.repo.owner-marker.integration.test.ts`: 2 files, 26 tests, all pass (20 + 6).
- `npx tsc --noEmit` in apps/api: clean.


## Review correction

- The Mastra agent already ran with maxRetries 0 (the agent default), so the explicit maxRetries 0 on the durable path is a safeguard, not a change: a 429 got 3 wrapper attempts before, and transient 5xx keep 3 wrapper attempts.

END-OF-REPORT
