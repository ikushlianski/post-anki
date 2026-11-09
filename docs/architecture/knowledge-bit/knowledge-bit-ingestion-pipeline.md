# Knowledge bit ingestion pipeline

How pasted text becomes knowledge bits with questions. One model call per chunk reads the whole source and returns quote-verified study items. Details of the items and the hand checklist: `source-first-items.md`.

## Triggers
- After paste (text, multi-text, URL, extension, MCP, Telegram, imports): the source is saved `pending`, then one Inngest job `extract-knowledge-source` is queued. Rejected input or a failed save never queues.
- Failed send: the source stays `pending`; the 5-minute sweep (`POST /knowledge-pipeline-sweeps`) re-queues it. See `durable-extraction.md`.
- After extraction inserts items, the follow-up passes run as one debounced Inngest job (`knowledge-bit-pipeline-kick`, 30 s debounce, 2 min max).
- For the bit pipeline, Cloud Scheduler calls only the sweep. The per-bit scan routes are manual operator routes. Other jobs (card embedding scan, biz-education distill, Notion source tick) keep their own schedules.

## Passes
The kick runs the ordered list `KNOWLEDGE_BIT_PIPELINE_STAGES` in `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts`. It has one stage, `source_items`, which runs `detectKnowledgeBits()`: the whole-source writer reads each source in chunks and inserts the items with their question variant in one transaction. A new pass is added by appending one entry.

The per-bit writers (wh-question, fill-blank, basic card) are not part of the kick. Their scan endpoints stay for legacy bits without variants and for bits whose body was edited.

Each pass is isolated: a failing pass is logged (`knowledge_bit_pipeline_kick_pass_failed`) and later passes still run. One `knowledge_bit_pipeline_kick_run_done` summary is logged per run.

## Regenerate
Each source group on the approval page has a Regenerate button. `POST /knowledge-sources/:id/regeneration` claims the source atomically, marks only its undecided (`pending`) bits `superseded` and replies 202, then runs the same writer in the background with an optional allowlisted `modelId`. A second call while a run is active gets 409, a missing source 404, a source without stored text 422. Approved and rejected bits are never touched. The page polls `GET /knowledge-sources/:id/regeneration` (`running`, `done`, `failed`) every 3 seconds and appends new items as each chunk is stored.

## Coalescing
Inside one process, at most one run is in flight plus one queued follow-up. Any number of kicks during a run produce exactly one follow-up. The kick never rejects.

## No duplicate work
The in-memory guard only limits runs inside one process. Duplicates are prevented by per-item DB claims: a source is claimed by a conditional pending-to-processing flip, and bits are claimed by token before any LLM call. A claim loser skips without calling the LLM.

## Throttling and interruption
Extraction runs on Inngest (free plan in prod), so an idle Cloud Run instance does not stall it. Interrupted in-process claims are released by stale-claim recovery (15 minutes for sources, 10 for bits); the sweep then re-queues them.

A failed source is final, and a stalled LLM call can cause it. Wh-question and fill-blank failures allow 3 attempts.

## Cost
A run is bounded like one scheduler tick: 20 sources per scan, chunks of 3000 characters with at most 3 running at once, 8 items per chunk and 40 per source, at most 3 attempts per LLM call. An empty run makes no LLM calls.

## Anki import job
A bulk import of an Anki export runs as the Inngest function `import-anki-notes` (event `anki-import/requested`, data `{ importId }` only). A local script (`npm run db:stage-anki-import -w @post-anki/api`) parses the file, refuses it on an unmapped deck, and stages the notes in `anki_import_notes`. The job then takes 20 staged notes per step, inserts them as keyed knowledge sources, starts durable extraction for the ones still pending and marks the notes imported. It refuses to start outside prod when `DURABLE_EXTRACTION` is unset, when the deck's sub-subject is missing, or more than 2000 notes are staged. Sending the same event again continues from the notes not yet imported; a singleton on the import id skips a second start while one runs.
