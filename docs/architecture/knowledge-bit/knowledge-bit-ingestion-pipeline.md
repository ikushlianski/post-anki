# Knowledge bit ingestion pipeline

How pasted text becomes knowledge bits with questions.

## Triggers
- After paste: the add-knowledge endpoint (text, multi-text, URL) replies 201, then fires `kickKnowledgeBitPipeline()` without awaiting it. Rejected input or a failed save never kicks.
- Backstop: Cloud Scheduler calls the three scan endpoints every 5 minutes. They are unchanged.

## Passes
The kick runs the ordered list `KNOWLEDGE_BIT_PIPELINE_PASSES` in `apps/api/src/knowledge-bit/knowledge-bit-pipeline-kick.orchestrator.ts`: `detect`, then `wh_question`, then `fill_blank`. A new pass is added by appending one entry.

Each pass is isolated: a failing pass is logged (`knowledge_bit_pipeline_kick_pass_failed`) and later passes still run. One `knowledge_bit_pipeline_kick_run_done` summary is logged per run.

## Coalescing
Inside one process, at most one run is in flight plus one queued follow-up. Any number of kicks during a run produce exactly one follow-up. The kick never rejects.

## No duplicate work
The in-memory guard only limits runs inside one process. Duplicates are prevented by per-item DB claims: a source is claimed by a conditional pending-to-processing flip, and bits are claimed by token before any LLM call. A claim loser skips without calling the LLM.

## Throttling and interruption
The API runs on Cloud Run with request-based billing (CPU is allocated only while a request is handled), minScale 0 and maxScale 1. A run after the response can stall until the next request, such as a scheduler call, and an idle instance can be shut down. On SIGTERM the DB pool is closed without waiting for the run.

Interrupted items are released by stale-claim recovery: 15 minutes for sources, 10 minutes for bits. The scheduler then processes them, so worst-case latency is about 15 to 20 minutes instead of an immediate run.

A failed source is final, and a stalled LLM call can cause it. Wh-question and fill-blank failures allow 3 attempts.

## Cost
A run is bounded like one scheduler tick: 20 sources for detect, 50 bits each for wh-question and fill-blank generation, at most 3 attempts per LLM call. An empty run makes no LLM calls.
