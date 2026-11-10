# Extraction hardening: items 3-7 report

Evidence check: inngest 4.23.0 is installed (apps/api/node_modules/inngest/package.json). Types confirmed in node_modules/inngest/components/InngestFunction.d.ts: `timeouts {start, finish}`, `throttle {key?, limit, period, burst?}`, `singleton {key?, mode: "skip"|"cancel"}`, function-level `retries` 0-20, `RetryAfterError(message, retryAfter: number|string|Date, {cause})` (components/RetryAfterError.d.ts), `NonRetriableError`. All exist, none skipped. There is no per-step retries option in this version (retries is function-wide), so the retry policy is function-wide plus error classification. The report's claim that inngest is missing from package.json is outdated (item 2 is another agent's, apps/api/package.json already shows a diff).

Files (all in /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit): extraction-inngest.workflow.ts (edited), extraction-inngest.limits.ts, extraction-inngest.errors.ts, extraction-inngest.steps.ts (new), plus co-located tests extraction-inngest.config.test.ts, extraction-inngest.errors.test.ts, extraction-inngest.steps.test.ts (new) and extraction-inngest.workflow.test.ts (chunk stub now returns counts). durable-extraction.starter.* and durable-extraction.steps.ts are untouched (the old durable engine still uses chunkStep/finishStep).

## Item 3: time limit
- Files: extraction-inngest.workflow.ts, extraction-inngest.limits.ts.
- Behavior: `timeouts: { start: "30m", finish: "30m" }`. The existing cancel handler (handle-extraction-cancel) gained a second trigger on `inngest/function.cancelled`, filtered to this function's qualified id, and reads the original event's sourceId/run to call failSourceOwnedByWorkflow. A payload without a source is logged and ignored. onFailure does not fire on cancellation, so the cancel handler is the reuse point. Start is 30m (not 10m) so throttled queueing does not cancel waiting runs.
- Tests: extraction-inngest.config.test.ts (timeouts value, cancelled trigger present).
- Undone / unverified: the installed types do not describe the `inngest/function.cancelled` payload; reading `data.event.data` is an assumption from Inngest docs memory and was not run against a server. The DB reconcile remains the backstop.
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts:57

## Item 4: retry policy
- Files: extraction-inngest.errors.ts, extraction-inngest.limits.ts, extraction-inngest.workflow.ts.
- Behavior: `retries: 1`. Chunk steps convert errors: 429 (statusCode/status 429 on the error or its cause chain) becomes RetryAfterError with retry-after-ms, retry-after seconds or HTTP date (default 30s, clamped 1s to 10m); everything else (wrong_language, no_valid_items, source_empty, source_too_long, invalid output, injection or refusal outcomes, other provider failures) becomes NonRetriableError. One layer per error class: the model wrapper (src/mastra/generate-with-retry.ts, 3 attempts, outside my scope and left alone) owns transient retries, so the engine never retries them; the engine only retries a 429, after waiting. Stored error messages are known codes or extraction_failed, never provider text.
- Tests: extraction-inngest.errors.test.ts (12 cases: waits, ms header preference, cause chain, default, clamp, 4 never-retry reasons, 500 not retried, no provider text).
- Undone: on a 429 the wrapper still makes up to 3 quick attempts before the engine waits and retries once (429 attempts are normally not billed); closing that needs a no-retry option in the wrapper.
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.errors.ts:92

## Item 5: throttle
- Behavior: `throttle: { limit: 10, period: "1m", burst: 2 }` on run starts, queueing not dropping; no rateLimit used. Values are constants in extraction-inngest.limits.ts (env.ts is off limits, so not configurable).
- Tests: extraction-inngest.config.test.ts (throttle set, rateLimit absent).
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts:55

## Item 6: one run per source
- Behavior: `singleton: { key: "event.data.sourceId", mode: "skip" }`. The lock ends with the run, so a regeneration after the first run finished starts normally; idempotency stays on event.id, which includes the run number. DB claim unchanged. Note: a regeneration sent while a run is still active is skipped by the engine.
- Tests: extraction-inngest.config.test.ts (singleton config, idempotency unchanged).
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts:56

## Item 7: no text in step results
- Behavior: chunk-N steps now read the text from the DB, extract, dedupe against stored statements, insert, and return only { accepted, inserted }. finish takes counts and the failure code, and marks detected or failed. claim, plan, fail already returned ids/counts/codes. Ordinals and per-chunk and per-source caps are preserved.
- Tests: extraction-inngest.steps.test.ts (6 cases: counts only, duplicate skip, cap, detected, failed, reclaimed).
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts:105

## Runs
- `npx vitest run` on config, errors, steps and durable-extraction.* tests from apps/api: 7 files, 90 tests, all pass.
- extraction-inngest.workflow.test.ts cannot run here: `@inngest/test` is not installed (apps/api/node_modules/@inngest is empty) and package.json belongs to another agent. I updated its chunk stub but it is unexecuted.
- `npx tsc --noEmit` in apps/api: only that same missing-module error in the workflow test; no errors in my files.

## Defaults
DURABLE_EXTRACTION unset: nothing here loads, the legacy in-process path is unchanged.

## Fix round: timed-out run fails its source without relying on the event payload
- Cause: the cancelled event only carries function_id and run_id, so the earlier handler never found the source.
- Fix: the claim now records the engine run id in the existing owner marker: failure_reason becomes durable:<sourceId>:<run>#<engineRunId>. No schema change or migration. The handler for inngest/function.cancelled reads run_id and fails the processing source whose marker ends with that id (failSourceByEngineRunId). An unknown run_id changes nothing. The user-cancel path still reads sourceId and run from the event data.
- Marker compatibility: owner checks (claim reload, failSourceOwnedByWorkflow) now accept both the plain and the #runId marker through one helper, so onFailure, guard and user cancel keep working and the starter's plain marker still matches. The DBOS reconcile and releaseDurableOwner are unchanged. The claim's updatedAt (the claim token) is not touched when the run id is added to an existing marker.
- Files: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit.repo.ts, /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts; tests in extraction-inngest.workflow.test.ts (real-shape {function_id, run_id} fails the right source; unknown run_id is a no-op) and extraction-inngest.config.test.ts mock update.
- Runs from apps/api: vitest extraction-inngest + durable-extraction: 8 files, 96 tests pass (workflow test now runs); knowledge-bit.repo tests 3 files, 25 pass; tsc --noEmit clean.
- Undone: no database-backed test of the new SQL (marker match and run-id lookup); it is covered only through mocks.
- Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/extraction-inngest.workflow.ts:164

END-OF-REPORT
