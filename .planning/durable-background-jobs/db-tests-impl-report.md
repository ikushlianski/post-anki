# Durable extraction database tests: report

Result: durable-extraction.workflow.integration.test.ts passes 20/20 against Postgres (was 16 failed / 4 passed). The new run-id lookup has its own Postgres cases.

## Root causes (none came from this session's marker change)

The marker change (`#engineRunId`, `ownerMatches`, `failSourceByEngineRunId`) caused none of the listed failures. Every one was already out of step before it. The 16/16 failure was mostly three shared causes, not 16 separate bugs.

### Shared cause A: migrations 0093-0096 were not in the journal (pre-existing, code/config bug)
- Symptom: DBOS workflow tests failed with `extraction_failed` at durable-extraction.workflow.ts:103. That line only rethrows a short code. The real error, found by un-muting the mocked logger, was `column "origin" of relation "knowledge_bits" does not exist`.
- Cause: `_journal.json` jumped from idx 92 to idx 97. Files 0093-0096 and their snapshots exist but were never registered, so a fresh database never got `knowledge_bits.origin`, `knowledge_sources.extraction_run` and so on.
- Fix: registered 0093-0096 in `apps/api/src/db/migrations/meta/_journal.json`. The `when` values sit between 0092 and 0097, so databases that already applied 0097 and later still skip them.

### Shared cause B: tests assumed workflow id `<sourceId>:1` (pre-existing, outdated tests)
- The starter names the workflow `<sourceId>:<claim token>`, where the token is the source's updated_at in milliseconds. The tests looked up `:1`, so step names, cancel, recovery-exhausted and long-run lookups hit nothing (`[]`, `undefined`).
- Fix: the tests take the workflow id from the starter's result (new helper `startOne`). The same-id no-op test now starts the workflow twice with a fixed run through `startExtractionWorkflow`. The resume test seeds a marker that matches the row's own updated_at. The "new run id" test drops its `extraction_run` update, which no longer decides the id.

### Per failure from the reviewer
1. Legacy stale-row sweep (`resetStaleProcessingKnowledgeSources` had no durable exclusion): pre-existing code bug. The config comment (`DURABLE_HARD_CEILING_MS`) promised this exclusion but the function never had it. Fix in code: a `durable:`-marked row is skipped unless its updated_at is older than the 6-hour ceiling. The 20-minute durable row stays processing and the 7-hour row resets to pending.
2. Claim test near line 489 (expected null after a release): pre-existing code bug. A regeneration claim used `status != processing`, so after `releaseDurableOwner` put the row back to pending, a late workflow could claim it next to the legacy fallback. Regeneration is always pre-claimed by `claimSourceForRegeneration`, so the durable claim now never runs the claiming UPDATE for regeneration and only reloads a row it owns. Tests unchanged.
3. Reconcile test (`workflow_record_missing` vs `workflow_executor_lost`): pre-existing, outdated test. The null-executor (Inngest) reconcile is by design a stale-age check with no engine-table lookup, and always writes `workflow_executor_lost`. The test expectation and title now say that. The assertion that a fresh row is left alone is unchanged.
4. DBOS workflow tests failing with `extraction_failed`: causes A and B above.
5. Extra bug found, not on the reviewer's list, pre-existing: the DBOS reconcile SQL used `SUBSTRING(failure_reason FROM $1)` with a bare parameter. Postgres took the regex form, so the join to `dbos.workflow_status` never matched and cancelled or recovery-exhausted workflows were never failed. Fix: `$1::int`.

## New Postgres cases (knowledge-bit.repo.owner-marker.integration.test.ts, 5 tests)
- A plain marker is upgraded to `#runId`; `updated_at` and the returned claim token are unchanged.
- The owner is still recognised after the upgrade; another workflow gets null.
- `failSourceByEngineRunId` fails only the matching processing source; a neighbour with another run id and a non-processing source with the same run id are untouched.
- An unknown run id, another source's marker id and a bare source id are no-ops.
- `%` and `_` in a run id do not match as wildcards.

## Files
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit.repo.ts (reset exclusion, regeneration claim, `::int`)
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/db/migrations/meta/_journal.json (4 entries)
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/durable-extraction.workflow.integration.test.ts
- /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit.repo.owner-marker.integration.test.ts (new)

extraction-inngest.* was not touched.

## Test runs (from apps/api, DATABASE_URL=postgres://pet_projects:pet_projects@127.0.0.1:5999/pet_projects)
- `npx vitest run --config vitest.integration.config.ts` on durable-extraction.workflow, knowledge-bit.repo.owner-marker and knowledge-bit.repo integration: 3 files, 46 tests, all pass (20 + 5 + 21).
- `npx vitest run extraction-inngest durable-extraction knowledge-bit.repo`: 11 files, 121 tests, all pass.
- `npx tsc --noEmit` in apps/api: clean.

## Undone and notes
- The journal edit is outside the extraction files. If another workstream owns 0093-0096 and re-adds the entries itself, drop mine to avoid duplicates.
- `reconcileDurableSources` (null executor) fails any `durable:` row older than the stale cutoff, even when the DBOS engine is selected and a step is still running. Left as is.
- The new test file holds 5 tests, under the 300-line limit. The workflow integration test file is still over 300 lines (it was before).

Citation: /Users/ikushlianski/webdata/ilya-projects/post-anki/apps/api/src/knowledge-bit/knowledge-bit.repo.ts:373

END-OF-REPORT
