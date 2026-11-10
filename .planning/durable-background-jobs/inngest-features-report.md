# Unused Inngest features worth adopting

PART 1/3

**Facts (current Inngest usage)**
- Installed SDK is inngest 4.23.0 (`apps/api/node_modules/inngest/package.json`). `inngest` is not listed as a dependency in `apps/api/package.json`, and `package-lock.json` has zero matches. The root `package.json` has only the `inngest:dev` script (line 54), which is modified and uncommitted. A fresh install would not pull the SDK. Verify this first.
- Client: `apps/api/src/shared/inngest-client.ts:3` is `new Inngest({ id: "post-anki-api" })`. It has no middleware, no signing key option and no `checkpointing` setting.
- Serve: `apps/api/src/shared/inngest-serve.ts:12` is a plain `serve({client, functions})`. It is mounted at `/api/inngest` in `api-server.ts:390`, registering two functions (`api-server.ts:346`).
- `server.ts:13` only logs the dev UI URL when `INNGEST_DEV=1`.
- `env.ts:56-59` declares `INNGEST_DEV`, `INNGEST_BASE_URL`, `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` as optional strings. Nothing enforces them.
- Used features:
  - `extract-knowledge-source` (`extraction-inngest.workflow.ts:36-62`): `retries: 3`, `idempotency: "event.id"`, `concurrency` of 2 global plus 1 per `sourceId`, `cancelOn` with a CEL match on `sourceId` and `run`, and an `onFailure` that fails the source row.
  - Steps are `claim`, `plan`, `chunk-N` (sequential, `:88-98`), `finish` and `guard`. Any error is converted to `NonRetriableError` (`:116`).
  - `handle-extraction-cancel` (`:121`) fails the source on a cancel event.
  - Events are typed with `eventType` and `staticSchema` (`extraction-inngest.events.ts`). They carry only `sourceId`, `run` and `regeneration`, with no text.
- Starter (`durable-extraction.starter.ts`): sends the event with id `sourceId:run` (`:68`). `makeInngestWorkflowExists` (`:108-126`) re-sends the event as an existence check, so it can start a real run (`:115`). Reconcile is DB-only, via `failProcessingSourcesWithEndedWorkflows`.
- Decisions from `.planning`: Inngest was chosen over DBOS, Temporal, Restate and Hatchet for the single HTTP endpoint, free dev server and keyed concurrency. Inngest Cloud was rejected on cost, so the plan is self-host or dev-only. The plan flagged the unsigned endpoint (`inngest-migration/plan-1.md` risks) and "set signing key before non-local use". Review BLOCKING-2 (cancel handler unregistered) is fixed.
- LLM calls sit inside `chunkStep` through `defaultGenerateItemsDeps()` (`extraction-inngest.workflow.ts:30`). The model wrapper has its own retry (per `durable-workflows/pilot-report.md`). Plain `step.run` is used, with no `step.ai`.

**Facts (jobs not on Inngest)**
- `knowledge-source.controller.ts:105-123` has a fire-and-forget extraction start and a fallback `kickKnowledgeBitPipeline()`. The kick (`knowledge-bit-pipeline-kick.orchestrator.ts`) is an in-process single-flight with a follow-up flag, running passes `detect`, `wh_question` and `fill_blank`. A crash loses it.
- `knowledge-source-regeneration.controller.ts:40-58` has fire-and-forget `generateItemsForSource` as fallback paths.
- `curriculum.controller.ts:246-271, 322, 519, 558, 759, 811` fire-and-forget `researchCurriculum`, `parseCurriculum`, `generateCurriculumFromApprovedSources`, `retryResearch`, `retryDraftStructure`, `mergeSources` and `reparse`.
- `curriculum-structure.ts:678` is a fan-out via `startCardsForTopicsWithConcurrencyCap`.
- `cards.orchestrator.ts:79,133` runs `compileCards`. `lecture.controller.ts:94` runs `compileLecture`. `study-material.controller.ts:32` runs `generateStudyMaterial`.
- Scans: `POST /doc-scans` (`domain-map.controller.ts:210`) is "the scheduled job's target", so something external calls it. It uses a global Postgres advisory lock (`doc-scan-lock.ts`). `subject-duplicate` scan runs synchronously from a POST. The embedding orchestrators (cards/facts) are not on Inngest. There is no `setInterval` or cron in the API.
- The web app polls for progress with `refetchInterval` (`curriculum.queries.ts:27`, `lecture-panel.tsx:18`, `card-panel.tsx:11`).

(Not read: the ai-dev principles folder. The shell refused `ls` on it, so cost and security guidance below comes from the project CLAUDE.md only.)

PART 2/3

**Ranked recommendations (Inngest v4 docs)**

1. Signing key and cloud-mode enforcement. Complexity: Simple.
   - Problem: `/api/inngest` is unsigned in dev mode and the API listens on all interfaces. Any LAN host can start extractions, which means paid LLM calls (`inngest-migration/plan-1.md` risk list; `env.ts:59` is optional and unchecked).
   - Fix: v4 defaults to cloud mode, which requires `INNGEST_SIGNING_KEY`. Make the key required whenever `INNGEST_DEV` is not 1 (fail at boot in `env.ts`). For the self-hosted server, pass the same key. Add `INNGEST_SIGNING_KEY_FALLBACK` for rotation. Pin and declare `inngest` in `package.json`.
   - Doc: https://www.inngest.com/docs/platform/signing-keys
   - Backlog: Only signed requests can start or run extraction jobs, so nobody on the network can spend model money.

2. Declare the dependency, then add `timeouts.finish`. Complexity: Simple.
   - Problem: the SDK is installed but missing from the manifest and lockfile. A fresh clone or deploy fails. Separately, nothing bounds a hung model call: a run can sit in `processing` until the 30-minute reconcile.
   - Fix: add `inngest@4.23.0` to `apps/api/package.json`. Add `timeouts: { start: "10m", finish: "30m" }` so stuck runs are cancelled, then rely on `cancelOn`/`onFailure` to mark the source failed.
   - Doc: https://www.inngest.com/docs/reference/functions/create
   - Backlog: Extractions that hang are cancelled automatically and the learner sees a failure instead of endless processing.

3. Retry policy and `RetryAfterError`. Complexity: Simple.
   - Problem: `retries: 3` applies per step, so a failing `chunk-N` can retry up to 3 times, and the model wrapper retries inside each attempt. That multiplies paid calls. The catch at `extraction-inngest.workflow.ts:93` also treats rate-limit and bad-input errors the same.
   - Fix: set `retries` low (1) for chunk steps, throw `NonRetriableError` for refusals, injection blocks and invalid input, and `RetryAfterError` with the provider's retry-after value on 429 errors. Add a total-attempts cost cap.
   - Doc: https://www.inngest.com/docs/features/inngest-functions/error-retries/inngest-errors
   - Backlog: Failed model calls retry only when it is useful and wait as long as the provider asks.

4. Throttle plus rate limit for provider limits. Complexity: Simple.
   - Problem: the cap is `concurrency: 2` (`:42-45`), which limits parallel runs but not calls per minute. Regeneration or bulk paste can still hit provider 429s.
   - Fix: add `throttle: { limit, period, key }` on the extraction function (queues, does not drop). Use `rateLimit` only for the cancel handler or other idempotent triggers where dropping is fine. Note that throttling limits run starts, not steps inside a run.
   - Doc: https://www.inngest.com/docs/guides/throttling
   - Backlog: Bursts of pasted material queue up smoothly instead of failing against model rate limits.

5. `singleton` per source instead of event-id-only dedupe. Complexity: Simple.
   - Problem: dedupe is the event id `sourceId:run` (24h). Regeneration bumps `run` and the existence check re-sends events (`durable-extraction.starter.ts:115`), so a second run for the same source can start while the first is active. Only the keyed `concurrency: 1` limits step execution, not the whole run.
   - Fix: add `singleton: { key: "event.data.sourceId", mode: "skip" }`. This cannot be combined with batching, which the app does not use. Keep the DB claim as the real guard.
   - Doc: https://www.inngest.com/docs/guides/singleton
   - Backlog: A source can never have two extraction runs active at once, so tokens are never spent twice.

6. Encryption middleware for event and step data. Complexity: Complex.
   - Problem: step outputs (chunk drafts, source text excerpts) are stored in the Inngest server's state. Events are clean (ids only) but step data is not (`extraction-inngest.workflow.ts:70-101`).
   - Fix: register the v4 encryption middleware on the client, or keep step outputs to ids and read the text from the DB. The second option is cheaper and fits the existing design. v3 middleware code does not work in v4.
   - Doc: https://www.inngest.com/docs/features/middleware
   - Backlog: Learner text never sits readable in the workflow engine's stored step results.

PART 3/3

7. Realtime progress to the browser. Complexity: Complex.
   - Problem: the learner sees no progress while a paste extracts; the web app polls (`curriculum.queries.ts:27` pattern) and a failure shows only after reconcile or `onFailure`.
   - Fix: `step.realtime.publish()` per chunk (`chunk-N of M`) and a final done or failed message, with a server-minted subscription token and the `useRealtime` hook in the web app. The page does not say whether the self-hosted server supports it, so verify before committing. Polling the existing source status is a cheaper first step.
   - Doc: https://www.inngest.com/docs/features/realtime
   - Backlog: The learner sees live chunk progress and a clear failure message while material is being extracted.

8. Move fire-and-forget background jobs onto Inngest. Complexity: Complex.
   - Problem: curriculum research and parsing, `compileCards`, `compileLecture`, `generateStudyMaterial` and the pipeline kick all run as `void fn().catch(log)` (`curriculum.controller.ts:246-811`, `cards.orchestrator.ts:79`, `lecture.controller.ts:94`). A restart loses them silently and leaves the row in "generating".
   - Fix: one event per job type, one function each. Use `step.sendEvent` fan-out for the per-topic card jobs (replacing `startCardsForTopicsWithConcurrencyCap`), and `onFailure` to set a failed status. Do the pipeline kick first as it is the most-used.
   - Doc: https://www.inngest.com/docs/guides/step-parallelism
   - Backlog: Background jobs survive restarts and always end in done or failed, never stuck.

9. `cron()` trigger for scans. Complexity: Simple.
   - Problem: `POST /doc-scans` (`domain-map.controller.ts:210`) depends on an external scheduler that is not in this repo. Overlap is handled only by an advisory lock.
   - Fix: `triggers: [cron("0 6 * * 1")]` calling the scan, with `singleton: skip`. The app runs UTC unless `TZ=` is prefixed. On the free plan a function pauses after 20 consecutive failures.
   - Doc: https://www.inngest.com/docs/guides/scheduled-functions
   - Backlog: Documentation change scans run on a schedule inside the app with no outside job.

10. `step.ai.wrap` for LLM calls. Complexity: Complex.
    - Problem: model calls in `chunkStep` show as opaque steps, so cost and prompts are not visible in traces.
    - Fix: wrap the Anthropic/AI SDK call. Arguments must be JSON serializable, and the Mastra agent path may not fit. Worth it only if traces are wanted.
    - Doc: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/step-ai-orchestration
    - Backlog: Each model call shows its prompt and token use in the workflow trace.

**Not recommended**
- `step.ai.infer`: it routes calls through Inngest servers and Mastra is not supported.
- Debounce and batching: extraction is per source, not event streams.
- Priority: one user, one queue; adds nothing.
- `step.sleep`, `waitForEvent` and `step.invoke`: no human-in-the-loop waits; the review flow already lives in DB state.
- Replay and bulk cancel: dashboard features that exist in the server UI already; replaying runs repeats paid LLM calls.
- Checkpointing tuning: on by default in v4; long-lived Node server, no serverless limits.
- Inngest Cloud: rejected on cost in the stack doc.

**Assumptions / To verify**
- Assumption: the `inngest` dependency is genuinely missing. Check the git history of `apps/api/package.json` and whether the root install hoists it.
- Assumption: function `retries` also applies to each step (per docs and Inngest behavior). Test it with a failing chunk.
- To verify: whether the self-hosted Inngest server enforces signing keys, supports Realtime, and exposes replay or bulk cancel; the docs fetched do not say.
- To verify: who calls `POST /doc-scans` today.
- To verify: `idempotency: "event.id"` is already covered by the event `id`; the extra behavior (24h window) matters for regeneration re-sends.
- Not checked: the ai-dev principles index (shell denied).

END-OF-REPORT
