# Unit C implementation report

## Files edited

### `apps/api/src/knowledge-bit/durable-extraction.starter.ts`
- Added imports: `loadEnv`, `createInngestClient`, `failProcessingSourcesWithEndedWorkflows`, `DurableExtractionInput`.
- Added exported `WorkflowAdapter` interface (4 methods: `launchDurableExtraction`, `startExtractionWorkflow`, `reconcileEndedWorkflows`, `shutdownDurableExtraction`) replacing the previous `WorkflowModule` type in `StarterDeps` and `loadedWorkflow`.
- Added exported `loadInngestWorkflow()`: creates an Inngest client; `startExtractionWorkflow` calls `inngest.send` with event name `knowledge-source/extraction.requested`, `id = "${sourceId}:${run}"`, and `data = { sourceId, run, regeneration }`; `launchDurableExtraction` / `shutdownDurableExtraction` are no-ops; `reconcileEndedWorkflows` calls `failProcessingSourcesWithEndedWorkflows(null)` (Postgres-only, no DBOS tables required).
- Added exported `loadWorkflow()`: checks `DURABLE_EXTRACTION_ENGINE` from env; routes to `loadInngestWorkflow()` for `'inngest'`, falls back to the DBOS dynamic import for any other value; result is module-level cached in `loadedWorkflow`.
- Added `makeInngestWorkflowExists()`: re-sends the event with the same `id` (idempotency deduplicates it) — accepted ⇒ `true`, throws ⇒ `false`.
- Updated `defaultDeps()` to use the top-level `loadWorkflow` and, when engine is `'inngest'`, `makeInngestWorkflowExists` for the `workflowExists` dep.

### `apps/api/src/knowledge-bit/durable-extraction.starter.test.ts`
- Added `vi.mock("./knowledge-bit.repo.js", ...)` to include `failProcessingSourcesWithEndedWorkflows` mock.
- Added `vi.mock("../shared/inngest-client.js", ...)` with a `mockSend` spy.
- Imported `loadWorkflow` and `loadInngestWorkflow` from the starter.
- Added `describe("inngest engine", ...)` with 4 tests: adapter has all 4 methods; `startExtractionWorkflow` calls `inngest.send` with correct name and id; `regeneration` flag passes through; `launch` and `shutdown` are no-ops.

### `apps/api/src/api-server.ts`
Left unchanged. The `extractionInngestFunction` export comes from unit B (`extraction-inngest.workflow.ts`) which is running in parallel and does not exist yet. Wiring it into the `createInngestServeHandler([...])` call belongs to unit D per the plan; the handler is already mounted at `/api/inngest` with an empty array from unit A.

## Quality gate results
- `npx tsc --noEmit` in `apps/api`: zero errors.
- `npx vitest run src/knowledge-bit/durable-extraction.starter.test.ts`: 22/22 tests passed (18 pre-existing + 4 new).
- `npx vitest run` (full suite): 1714/1715 tests passed; the one failure is in `durable-extraction.steps.test.ts` (pre-existing — it fails with 6 tests before my changes even without the starter).

## Defaults chosen
- `WorkflowAdapter` interface defined in the starter (not imported from a shared types file) since it is the starter's own abstraction over whatever workflow engine is active.
- `failProcessingSourcesWithEndedWorkflows(null)` for Inngest reconcile: `null` executor ID means the DBOS executor-lost branch is a no-op; only orphaned rows (no workflow record, stale) are failed — correct because Inngest state is not in Postgres.
- `makeInngestWorkflowExists` re-sends with `regeneration: false` as a safe default (the DB claim blocks a real second run; this is only a check, not a trigger).

END-OF-REPORT
