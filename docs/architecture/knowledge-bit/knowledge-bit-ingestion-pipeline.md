# Knowledge bit ingestion pipeline

How pasted text becomes knowledge bits with questions. One model call per chunk reads the whole source and returns quote-verified study items. Details of the items and the hand checklist: `source-first-items.md`.

## Triggers
- After paste: the add-knowledge endpoint (text, multi-text, URL) replies 201, then fires `kickKnowledgeBitPipeline()` without awaiting it. Rejected input or a failed save never kicks.
- Backstop: Cloud Scheduler calls the three scan endpoints every 5 minutes. They are unchanged.

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
The API runs on Cloud Run with request-based billing (CPU is allocated only while a request is handled), minScale 0 and maxScale 1. A run after the response can stall until the next request, such as a scheduler call, and an idle instance can be shut down. On SIGTERM the DB pool is closed without waiting for the run.

Interrupted items are released by stale-claim recovery: 15 minutes for sources, 10 minutes for bits. The scheduler then processes them, so worst-case latency is about 15 to 20 minutes instead of an immediate run.

A failed source is final, and a stalled LLM call can cause it. Wh-question and fill-blank failures allow 3 attempts.

## Cost
A run is bounded like one scheduler tick: 20 sources per scan, chunks of 3000 characters with at most 3 running at once, 8 items per chunk and 40 per source, at most 3 attempts per LLM call. An empty run makes no LLM calls.
