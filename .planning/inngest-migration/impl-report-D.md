# Unit D implementation report

## Files edited

### `apps/api/src/api-server.ts`
- Added import `extractionInngestFunction` from `./knowledge-bit/extraction-inngest.workflow.js`.
- Changed `createInngestServeHandler([])` to `createInngestServeHandler([extractionInngestFunction])`.
- Only the import line and the functions array argument were touched; all other staged hunks from units A and the pilot were left untouched.

### `apps/api/src/knowledge-bit/knowledge-bit.repo.ts`
- Added import `durableStaleMs` from `./durable-extraction.config.js` (alongside the existing `DURABLE_OWNER_PREFIX` import).
- Exported `failProcessingSourcesWithEndedWorkflows(executorId, _options?, staleMs?, db?)`:
  - **null branch (Inngest)**: Drizzle `UPDATE knowledge_sources SET status = 'failed', failure_reason = 'workflow_executor_lost'` where status is `'processing'`, `failure_reason LIKE 'durable:%'`, and `updatedAt < cutoff`. No DBOS tables touched.
  - **string branch (DBOS)**: Raw SQL CTE joining `dbos.workflow_status` + `dbos.operation_outputs`; classifies `CANCELLED` → `workflow_cancelled`, `MAX_RECOVERY_ATTEMPTS_EXCEEDED` → `workflow_max_recovery_attempts_exceeded`, stale progress → `workflow_executor_lost`.

## Reconcile verification (orchestrator)
`detect-knowledge-bits.orchestrator.ts` needs no changes. The Inngest adapter's `reconcileEndedWorkflows` (from unit C) already calls `failProcessingSourcesWithEndedWorkflows(null)`, which now exists and uses a purely app-DB stale-age check. Because Inngest-owned rows use the same `durable:` owner prefix in `failure_reason`, the null branch matches them identically to DBOS rows. No second reconcile pass is needed in `detectKnowledgeBits()`.

## Quality gate results
- `npx tsc --noEmit` in `apps/api`: no new errors introduced. All errors visible are pre-existing from the untracked DBOS pilot files (`durable-extraction.starter.ts`, `durable-extraction.steps.ts`, `durable-extraction.workflow.integration.test.ts`, and unrelated schema files); same set was present before unit D.
- `npx vitest run apps/api/src/shared/inngest-serve.test.ts`: 3/3 passed.

## Defaults chosen
- `workflow_executor_lost` used as the failure reason for the null/stale path: matches the DBOS stale-progress reason, keeping reason codes consistent across engines.
- `GREATEST(ws.updated_at, COALESCE(MAX(o.completed_at_epoch_ms), 0))` for DBOS last-activity: mirrors what the integration tests verify (both the workflow row and the step outputs contribute to liveness).
- `_options?: unknown` second parameter: the integration tests pass `undefined` there; kept as a pass-through to not break existing callers.

END-OF-REPORT
