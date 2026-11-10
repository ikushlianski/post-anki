# Unit B implementation report

## Files created

- `apps/api/src/knowledge-bit/extraction-inngest.events.ts` — exports `extractionRequestedEvent` (trigger: `knowledge-source/extraction.requested`, data: `{sourceId, run, regeneration}`) and `extractionCancelRequestedEvent` (trigger: `knowledge-source/extraction.cancel-requested`, data: `{sourceId, run}`), both using `eventType` + `staticSchema` from inngest. Event id convention `${sourceId}:${run}` is set at send time (unit C).
- `apps/api/src/knowledge-bit/extraction-inngest.workflow.ts` — exports `extractionInngestFunction` (retries: 3, idempotency: `event.id`, concurrency `[{limit:2},{key:event.data.sourceId,limit:1}]`, `cancelOn` the cancel event matched on sourceId+run, `onFailure` calls `failSourceOwnedByWorkflow`) and `extractionCancelHandler` (listens on the cancel event, wraps `failSourceOwnedByWorkflow` in `step.run("fail-cancelled-source")`). Steps claim/plan/chunk-N/finish/guard/release follow the DBOS parity exactly; outer catch throws `NonRetriableError` to prevent retries after controlled failure.
- `apps/api/src/knowledge-bit/extraction-inngest.workflow.test.ts` — 4 unit tests with `@inngest/test` InngestTestEngine: claim-null exits cleanly (skipped), plan-failure marks source failed, one-chunk-success marks detected, cancel-handler calls `failSourceOwnedByWorkflow` with sourceId+workflowId.

## Files modified (additive)

- `apps/api/src/knowledge-bit/knowledge-bit.repo.ts` — added `claimOrLoadSourceForExtraction`, `failSourceOwnedByWorkflow`, `getKnowledgeSourceRawText` (plus `ne` drizzle import and `DURABLE_OWNER_PREFIX` import). These three functions are required by both the inngest workflow and the pre-existing untracked DBOS workflow; without them both fail to compile. Added `ne` to drizzle-orm imports and `DURABLE_OWNER_PREFIX` from config.

## `@inngest/test` devDependency

`@inngest/test` installed as devDependency in `apps/api/package.json`.

## Stash recovery note

During verification, a `git stash` / `stash pop` failure (caused by a conflicting web route-tree file) lost the staged unit A files. All staged unit A files were recovered from the dangling stash commit (`3553053a`) and re-staged. Foreign working-tree changes (router-table.ts, router.ts, planning files) were also restored. No staged file from before the session was permanently lost.

## Defaults chosen

- `idempotency: "event.id"` — the event id is set to `${sourceId}:${run}` at send time (unit C), so `event.id` is the natural dedup key.
- `extractionCancelHandler` as a second Inngest function rather than `step.waitForEvent` — keeps the cancel logic independent of the main run and gives a clear audit step (`fail-cancelled-source`).
- `GENERIC_FAILURE_REASON` (`"extraction_failed"`) as the reason stored when a run is cancelled or the `onFailure` handler fires, because `"extraction_cancelled"` is not in `KNOWN_REASONS`; adding it would require modifying the config file which is outside unit B.

## Quality gate results

- `npx tsc --noEmit` in `apps/api`: zero errors in the three new files and `knowledge-bit.repo.ts`; pre-existing errors in untracked pilot files unchanged.
- `npx vitest run src/knowledge-bit/extraction-inngest.workflow.test.ts`: 4/4 tests passed.

END-OF-REPORT
