# Durable extraction pilot (DBOS) behind a default-off flag (2026-10-11)

Item: 'Run source extraction as a durable workflow behind a default-off flag'. Nothing committed. `apps/api/.env` and the local Docker DB on 5562 were not touched. Integration runs used the shared pet-projects Postgres on 127.0.0.1:5999 with a throwaway database that is dropped at the end of each file.

## What was built

- Flag: `DURABLE_EXTRACTION` (`1` or `true`, default off) and `DBOS_APPLICATION_VERSION` in `apps/api/src/shared/env.ts` (`durableExtractionFlagSchema`).
- `apps/api/src/knowledge-bit/durable-extraction.starter.ts` (no DBOS import): reads the flag, loads the workflow module with a dynamic import only when needed, launches the engine lazily, starts one workflow per source with id `<source id>:<extraction_run>`, returns `{ started, fallbackIds }`; a launch or load failure sends every source to the fallback list, a single failed start only that source. `shutdownDurableExtraction` is wired into the existing SIGTERM/SIGINT shutdown in `server.ts` and does nothing when the engine was never launched.
- `apps/api/src/knowledge-bit/durable-extraction.workflow.ts` (the only file that imports `@dbos-inc/dbos-sdk`): workflow `extractSource` with steps `claim`, `plan`, `chunk-N` (no engine retry, the model wrapper already retries), `finish`; `DBOS.setConfig` with `systemDatabaseUrl = DATABASE_URL` and the pinned application version when set.
- `apps/api/src/knowledge-bit/durable-extraction.steps.ts` (no DBOS import): the step bodies as plain functions over injected deps, reusing `writeAndValidate`, `chooseModelId`, `rejectRawText`, `loadFeedbackBlockSafely`, `truncateReason` (now exported from `detect-knowledge-bits.orchestrator.ts`, no behavior change), `selectNewItems`, `insertSourceItemsForChunk`, `markKnowledgeSourceBitsDetected`, `markKnowledgeSourceFailed`.
- `apps/api/src/knowledge-bit/knowledge-bit.repo.ts`: new `claimOrLoadSourceForExtraction` (claim a pending source by id, or load the processing one a regeneration already claimed) and `getKnowledgeSourceExtractionRun`.
- Wiring: `knowledge-source.controller.ts` (text, batch and link creation) and `knowledge-source-regeneration.controller.ts` start the workflow when the flag is on and fall back to the old kick or in-process generation on any failure; with the flag off the code runs exactly as before.
- Docs: `docs/architecture/knowledge-bit/durable-extraction.md` (flag, id scheme, steps, deploy versioning rule, audit queries on `dbos.workflow_status` and `dbos.operation_outputs` with the real column names, how to cancel).

## Dependency diff

- `apps/api/package.json`: `+ "@dbos-inc/dbos-sdk": "^5.2.11"` (installed 5.2.x, same as the spike); the `undici` line in the same diff comes from the earlier DNS-pinning task.
- `package-lock.json`: entries for the DBOS SDK and its dependencies were added with `npm install -w @post-anki/api`; no other package versions were changed on purpose.

## Verification (real output)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- `npx vitest run` in apps/api: Test Files 169 passed (169), Tests 1586 passed (1586). In apps/web: Test Files 175 passed (175), Tests 1163 passed (1163).
- New unit tests: `durable-extraction.starter.test.ts` (7: flag parsing, DBOS package not imported while off via a mock that throws on import, id scheme, duplicate start, launch failure, load failure, per-source failure), `durable-extraction.steps.test.ts` (12), `knowledge-source.controller.durable.test.ts` (5), `knowledge-source-regeneration.controller.durable.test.ts` (4).
- Integration on the pet lane, real Postgres and real DBOS with a fake model: `durable-extraction.workflow.integration.test.ts` 4 of 4 passed (steps recorded as claim, plan, chunk-0, finish each once; duplicate start leaves one workflow row and one model call; a model error marks the source failed with that reason; a finished source with a new run id is left untouched). The existing integration files for the source repo, the regeneration repo and migrations: 56 of 56 passed.

## Left open

- Chunks run sequentially in the pilot; the old path runs three concurrently.
- Not verified: the engine on Neon (pooler, scale to zero), and rolling deploys with in-flight runs. The pinned version rule is documented, not exercised.
- No real-browser or real-model run with the flag on was done; the pilot is covered by the fake-model integration test.
- A source cancelled in DBOS stays in `processing` until reset by hand (documented SQL).
- The flag is not set anywhere (no deploy config changed).

## Review round 1

Each of the five findings was checked in the code first. All five are real.

- **H1 (real).** An error in `claim`, `plan`, `finish` or any non-chunk step ended the workflow in `ERROR` with the source left in `processing`; only chunk errors were caught. Fix: the whole workflow body is wrapped, and anything unexpected runs a `guard` step that marks the source failed with the error text (200 characters), the same claim-checked write as the old path, then rethrows so the run stays `ERROR` in the audit. A cancelled or abandoned run cannot run a guard, so at every launch and every start `failProcessingSourcesWithEndedWorkflows` marks sources whose run ended (`CANCELLED`, `ERROR`, `MAX_RECOVERY_ATTEMPTS_EXCEEDED`) as failed (`workflow_cancelled`, `workflow_error`, ...) and sources whose run is `PENDING` under another executor for more than 15 minutes as `workflow_executor_lost`. Tests: integration 'unexpected workflow error' (insert made to throw, source ends failed with that reason, `guard` step recorded) and 'cancelled workflow' (a running workflow cancelled through `DBOS.cancelWorkflow`, source ends failed with `workflow_cancelled`).
- **H2 (real).** The claim step moved the source from `pending` to `processing`; a crash after that write and before the engine recorded the step output made the re-run find no pending source and end as `skipped`, leaving the source stuck. Fix: the claim writes the owner `durable:<workflow id>` into `failure_reason`; the re-run loads a processing source owned by the same workflow id with the same claim time (`updated_at`), and a different workflow id gets nothing. Tests: integration 'claim written but never recorded' (a source seeded as processing and owned by the workflow completes as detected) and 'same claim when the claim step runs again'.
- **H3 (real).** The `claim` output carried `rawText`, `plan` returned all chunk texts, the feedback block and existing statements, and chunk steps took the chunk text, so source text and reviewer feedback were written into the `dbos` tables. Fix: `claim` returns only ids and the claim time, `plan` only `chunkCount` and `firstOrdinal`, each `chunk-N` step takes the snapshot and the chunk number and reads the text, the chunk and the feedback block itself, `finish` re-reads the existing statements. The validated drafts (with their verbatim quote) remain as step outputs. Test: integration 'source text and feedback out of the engine tables' (a unique marker sentence in the source is absent from `dbos.workflow_status` and `dbos.operation_outputs`) and unit tests that the claim and plan outputs contain no source text. The doc now lists what is stored, the retention and a purge query (the audit found that `operation_outputs` has no foreign key to `workflow_status`, so the purge deletes it first).
- **H4 (real).** The SDK uses `DBOS__VMID || 'local'` as executor id, so every instance recovered the others' pending runs. Fix: `createExecutorId()` (host, pid, random suffix) goes into the engine config as `executorID`; `DBOS_EXECUTOR_ID` overrides it for a single-instance deployment. Tests: unit (two ids differ, are not `local`, the override wins, the application version is pinned) and integration (the recorded `executor_id` equals the process executor id and is not `local`). Trade-off, documented: with a unique id a restarted process does not resume the dead process's runs; those sources are failed after 15 minutes and regenerated by hand unless a stable `DBOS_EXECUTOR_ID` is set.
- **H5 (real).** Loading the module, launching the engine, the reconcile query and a workflow start had no bound, so the fallback could hang. Fix: each is wrapped in `withTimeout` (default 10 seconds, `DURABLE_EXTRACTION_TIMEOUT_MS` or the `timeoutMs` option); a timeout logs an error and sends the source to the old pipeline. Tests: a never-resolving launch sends every source to the fallback, a never-resolving start only that source, `withTimeout` and the env parsing.

Mutation check (the tests fail without the fix): with the `guard` step removed the 'unexpected workflow error' test failed; with the owner check removed the 'claim written but never recorded' and 'same claim' tests failed. Not mutation-tested: the H3, H4 and H5 tests (they assert the stored data, the executor id and the fallback, and the old code visibly did the opposite).

### Verification (real output)

- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- `npx vitest run` in apps/api: Test Files 170 passed (170), Tests 1594 passed (1594). In apps/web: Test Files 177 passed (177), Tests 1179 passed (1179).
- Pet-lane integration (127.0.0.1:5999, throwaway database, real DBOS, fake model): `durable-extraction.workflow.integration.test.ts` 10 of 10 passed; together with the source items repo and the knowledge-source integration files: Test Files 4 passed (4), Tests 31 passed (31).

### Still not verified

- Neon (pooler type, scale to zero, cost of the `dbos` writes) and a rolling deploy with in-flight runs.
- A real model run with the flag on in the dev app; only the fake-model integration test covers the flow.
- Two real instances at once (the executor id behavior is tested for uniqueness and recorded id, not with two processes recovering).
- Crash recovery of a unique-id process's runs is by design not automatic (see the trade-off above).
- The H3 text-absence test checks one marker sentence; the drafts' quotes are stored by design.

## Review round 2

| Item | Real? | Fix | Test (fails without the fix) |
|---|---|---|---|
| N1 strict env breaks boot with the flag off | Real: the main schema used an enum and a coerce for the new variables, so an empty or odd value threw in `loadEnv`. | `DURABLE_EXTRACTION`, `DURABLE_EXTRACTION_TIMEOUT_MS`, `DURABLE_EXTRACTION_STALE_MS`, `DBOS_*` are plain optional strings in `shared/env.ts`; parsing with fallbacks lives in `durable-extraction.config.ts` (off, 10 s, 30 min). | `shared/env.durable.test.ts`: boots and stays off for empty, `yes`, garbage, `TRUE`, `0`, `false`; on only for `1`/`true`; bad limits fall back. |
| N2 error text and causes in engine tables | Real: mutation (rethrowing the raw error) put the error message and the `cause` with the marker into `dbos.operation_outputs`. | Every step and the workflow's outer catch throw a fresh `Error` carrying only a code (`extraction_failed`, `no_valid_items`, ...); the full error goes to the app log. Failure reason on the source is the same code. | Integration: model error with marker in message and cause; marker absent from workflow and step rows. Failed with the mutation, passes with the fix. |
| N3 unbounded recovery | Real: no limit was set on the registration. | `maxRecoveryAttempts: 3`; engine step retries stay off. Worst case and cancel instructions in `durable-extraction.md` (5 chunks: at most 5 x 4 x 4 = 80 model calls). | Registration test (limit is 3); integration: a run the engine ended as `MAX_RECOVERY_ATTEMPTS_EXCEEDED` ends with the source failed `workflow_max_recovery_attempts_exceeded`. |
| N4 15-minute reset kills long runs | Real: a run longer than 15 minutes had a claim time older than the legacy cutoff. | The claim token is not refreshed (steps check it). Progress is read from engine step completion times; reconcile cutoff `DURABLE_EXTRACTION_STALE_MS` (default 30 min); the legacy reset skips `durable:`-owned rows until 6 hours old. | Integration: run with 5-minute-old progress and a 50-minute-old claim is not failed; with 45-minute-old progress it is failed `workflow_executor_lost`. Integration: durable row 20 min old stays processing, 7 h old is reset. |
| M5 timeout then fallback runs twice | Real: a start that timed out could still create the workflow. | After a start failure or timeout the starter checks `dbos.workflow_status` for the id; if it exists the source is counted as started, otherwise it falls back. Applies to creation and regeneration. | Starter unit tests: exists means no fallback; missing or check failing means fallback. |
| H1 gap: claim step fails after commit | Real. | The outer catch runs a `release` step that fails the source only when it is still owned by this workflow. | Integration: claim throws after its write; source ends failed `extraction_failed`, `release` step recorded, model never called. |

Real outputs, this round:
- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/api `npx vitest run`: 173 files, 1628 tests passed. apps/web: 178 files, 1198 tests passed.
- Pet lane (127.0.0.1:5999, throwaway database), pilot integration file: 15 of 15 passed; with `knowledge-bit.repo.integration`, `knowledge-source` integration files: 61 of 61 passed.
- Mutation check for N2 (rethrow the raw error): the marker test failed with the marker text and cause visible in the step output; file restored.
- The legacy reset unit mock only understands flat conditions, so it was taught to skip `or` clauses (`knowledge-bit-repo.test-mock-db.ts`); the real condition is covered by the pet-lane test.

Still not verified:
- Recovery through the real engine (a restarted process with a pinned executor id resuming and hitting the limit): the limit is covered by the registration test and by the state the engine writes, not by driving a real recovery.
- N3 and N4 mutation checks were not run; only N2 and the claim ownership checks were.
- Neon pooler and scale-to-zero, two real instances, and a real-model run with the flag on.
- Orphaned `dbos` rows after a source is deleted are not cleaned automatically (purge query in the doc).

## Review round 3

| Item | Real? | Fix | Test (fails without the fix) |
|---|---|---|---|
| High 1: long regenerations reset by the legacy stale reset | Real: the regenerate claim clears the owner field and the claim step never wrote the marker, so the 15-minute reset did not skip it. | The starter writes `durable:<id>:<run>` on the claimed regeneration row (updated_at untouched, the claim token stays valid) before starting. | Pet lane: regeneration claimed through the real claim function plus marker stays `processing` at 20 minutes and is reset at 7 hours. Fails when the exclusion is removed. |
| High 2: crashed run stays processing, user cannot retry | Real: the executor-lost reconcile ran only on a durable start. | `reconcileDurableSources()` runs from the scheduled detect-bits path when the flag is on (no engine launch); it also fails `durable:`-owned rows with no engine record (or no engine tables) after the stale cutoff (`workflow_record_missing`); the repo function now checks the engine tables exist; a failing query is logged and retried next call. | Pet lane: 45-minute-old orphan failed from the scheduled path, 2-minute-old row left alone; flag off touches nothing. Orchestrator calls the reconcile each run. |
| Medium 3: late start vs in-process fallback | Real. | The claim step requires the owner marker for regenerations too; the starter drops the marker before falling back (unless the engine already has the workflow). | Pet lane: regeneration claim returns nothing without the marker, loads with it, nothing after release. Fails when the regeneration exemption is restored. Starter tests: marker written before start, released before fallback, fallback when it cannot be written. |
| Medium 4: run lookup failure assumed run 1 | Real. | Unknown run number sends the source to the legacy path; no start, no existence check. | Starter unit test. |
| Medium 5: unclamped limits | Real: 2147483648 or huge values were accepted. | Launch timeout 1 s to 5 min, stale cutoff 5 min to 6 h; anything else falls back to the default. | `durable-extraction.config.test.ts`: 2147483648, huge, tiny, negative, fractional, empty, boundaries. The earlier env test used 60000 for the stale cutoff and now uses 600000. |

Real outputs, this round:
- `npx tsc --noEmit`: exit 0 in apps/api, packages/shared, packages/core. apps/web gave exit 2 once while other work was editing it, then exit 0 on rerun with no change from me.
- apps/api `npx vitest run`: 175 files, 1667 tests passed. apps/web: 179 files, 1209 tests passed.
- Pet lane: pilot integration file 19 of 19; with all `knowledge-bit` and `knowledge-source` integration files, 31 files and 377 tests passed.
- Mutation check: restoring the regeneration owner exemption and removing the legacy durable exclusion failed 3 integration tests; the repo file was restored.

Still not verified:
- Real engine recovery after a restart with a pinned executor id, and the recovery limit through the engine.
- N3 and N4 mutation checks, Neon pooler and scale-to-zero, two real instances, a real-model run with the flag on.
- The scheduled reconcile was run against a real database but not through the Cloud Scheduler route.
- The marker is written just after the regenerate claim, not inside it; a crash in that few-millisecond gap leaves an unowned regeneration that the legacy 15-minute reset handles.

## Review round 4

No Critical or High. The cheap Medium and Low items are closed:

| Item | Change | Test |
|---|---|---|
| 1 Hard limit on chunk model calls | Every model call of one chunk step (retries included) shares one `AbortSignal.timeout(10 min)` passed through the write options to the agent. The minimum stale cutoff is raised from 5 to 20 minutes, above the largest launch timeout (5 min) plus the chunk deadline (10 min). Docs updated (stale range, progress paragraph, scheduled reconcile passes no executor id). | Steps test: all calls of a chunk receive the same live abort signal (fails when the signal is removed; checked by mutation). Config test: minimum cutoff greater than launch max plus deadline, and 20 min boundary. |
| 2 Unknown outcomes | A failed existence check or a failed marker release no longer triggers the in-process fallback; the source is returned in `unknownIds`, logged, and left to the scheduled reconcile. | Starter tests for both cases. |
| 3 Marker guarded | `markSourceOwnedByDurable` requires the run number and claim time the starter read (`getKnowledgeSourceClaimToken`, which now throws for a missing source instead of assuming run 1). | Pet lane: wrong run and claim time off by 1 ms are refused, the right token is accepted. |
| 4 Reconcile independent of the flag | The scheduled reconcile runs whenever durable-owned processing rows exist, reads the engine tables only if they exist, and does nothing otherwise. | Pet lane: with the flag off an orphan is failed, the second call returns nothing. |
| 5 Config | Stale cutoff range is now 20 min to 6 h (comfortably above the launch timeout). Claim time stays on the application clock; documented why that is safe. | Config and env tests updated. |
| 6 Docs line about failure text | The guard step marks a short reason code, not the error text. | n/a |
| 7 Stray file | `durable-extraction.starter.test.ts-E` deleted. | n/a |

Real outputs, this round:
- `npx tsc --noEmit`: exit 0 in apps/api, apps/web, packages/shared, packages/core.
- apps/api `npx vitest run`: 175 files, 1670 tests passed.
- Pet lane (127.0.0.1:5999): pilot integration file 20 of 20; with all `knowledge-bit` and `knowledge-source` integration files, 31 files and 382 tests passed. One failure on the first run was the old `{ started, fallbackIds }` expectation, which now carries `unknownIds`; fixed.

Still not verified: real engine recovery after a restart with a pinned executor id; the scheduled reconcile through the Cloud Scheduler route; Neon pooler and scale-to-zero; two real instances; a real-model run with the flag on; whether the abort signal really cuts a live provider call (the agent already accepted the signal before this change, but no real call was aborted).

END-OF-REPORT
