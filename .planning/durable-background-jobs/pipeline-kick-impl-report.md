# Durable pipeline kick (spec item 8) implementation report

## Files (all under apps/api/src)
- knowledge-bit/pipeline-kick-inngest.events.ts (new): typed event `knowledge-bit/pipeline-kick.requested`, data `{ requestedAt }` only.
- knowledge-bit/pipeline-kick-inngest.workflow.ts (new): Inngest function `knowledge-bit-pipeline-kick`.
- knowledge-bit/pipeline-kick.starter.ts (new): `startKnowledgeBitPipelineKick()` picks durable vs in-process.
- knowledge-bit/pipeline-kick.starter.test.ts, knowledge-bit/pipeline-kick-inngest.workflow.test.ts (new).
- knowledge-source/knowledge-source.controller.ts: three kick calls now use the starter.
- knowledge-source/knowledge-source.controller*.test.ts (7 files): mock path/name switched to the starter.
- api-server.ts: function registered next to the extraction functions.
- knowledge-source-regeneration.controller.ts does not kick; unchanged.

## Behavior
- Flag off: starter calls the existing in-process single-flight kick, unchanged.
- Flag on: starter sends one event; if the send fails it falls back to the in-process kick so approved sources are not stranded.
- Function: one step per pass (pass-detect, pass-wh_question, pass-fill_blank). A failing pass is logged inside its step and returns "failed" (no retry storm, later passes still run); step results are status strings only, no text.
- Concurrency limit 1 globally. Burst collapse via `debounce { period: "5s", timeout: "30s" }` (v4 shape checked in inngest types.d.ts); events arriving while a run is active queue behind concurrency and debounce into one follow-up run. retries 1; start/finish timeouts 30m; onFailure logs.

## Tests
- `npx vitest run src/knowledge-bit/pipeline-kick src/knowledge-source/knowledge-source.controller`: 10 files, 88 passed, 0 failed (8 new: 4 starter, 4 workflow via @inngest/test).
- `npx tsc --noEmit` in apps/api: clean.

## Defaults chosen
- Debounce over singleton/event id: singleton skip would drop a kick arriving mid-run, losing the follow-up.
- Event data carries a timestamp only; no ids needed since the pass reads the DB.
- Pass failures swallowed per pass (matches in-process behavior) rather than failing the run.

## Undone
- Event-send fallback runs in-process in the API process, which could overlap a durable run that is already active; the passes claim rows in the DB, so this is believed safe but unverified.
- Debounce/concurrency not exercised against a real Inngest server (only @inngest/test).
- Evidence report section 8 not re-verified beyond the kick description (inngest-features-report.md:21, :81).

## Citation
apps/api/src/knowledge-bit/pipeline-kick-inngest.workflow.ts:18-19 (concurrency limit 1 and debounce on the kick function).

END-OF-REPORT
