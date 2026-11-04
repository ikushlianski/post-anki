# Mastra experiments probe (2026-10-11)

Script: scripts/mastra-experiment-probe.mjs (read-only; in-memory Mastra storage; production extraction code per model). Run: `node --import tsx scripts/mastra-experiment-probe.mjs [excerpt-file] [comma-separated openrouter/... model ids]`.

## Facts (observed on @mastra/core 1.37.1)

- `runExperiment(mastra, { data, task, scorers, maxConcurrency, itemTimeout })` works with inline `data` items and a `task` function; no dataset id, no registered agent and no database are needed.
- `new Mastra({ storage: new InMemoryStore() })` from `@mastra/core/storage` is enough for the run; no @mastra/pg or @mastra/libsql is installed in this repo.
- One data item per model, with the model id in the item input, gives a per-model comparison: the task calls `runKnowledgeBitSourceItems(excerpt, { modelId })` (the production path) and validates with `validateSourceItems`. Per-run model override is not needed in Mastra itself.
- `createScorer({ id, description }).generateScore(({ run }) => number)` ran and its score came back per item (`valid-share`).
- Two items ran concurrently (maxConcurrency 2). Result per item: output, error, start and end time, retryCount, scores.
- Run on the Russian sales text: claude-haiku-5.5 returned 5 items, all valid, 9.4 s; gemma-4-31b-it returned 4, all valid, 29.6 s.

## Implications for the Compare models page

- Use `runExperiment` with inline data per selected model; persist grades and run summaries in our Postgres tables, not in Mastra's store (the in-memory store is discarded after a run).
- Wrap each model in its own item so a failing model does not stop the others (item-level `error` is recorded).
- Cost and token usage are not part of the experiment summary; read them from the same llm_call_events path or compute from usage in the task.

## To verify

- Persistent datasets in Postgres need @mastra/pg (not installed); not needed for the first version.
- The probe wrote llm_call_events rows only if the target database has that table (the pet-projects database was used; write failures are swallowed by the production code).
- A Haiku question contained "по данному утверждению" and passed the meta-wording guard (the guard only covers "согласно/судя по" plus "утверждению").

END-OF-REPORT
