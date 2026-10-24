# Knowledge-bit ingestion pipeline

## Trigger

A user pastes text, submits a batch of texts, or imports a URL via `POST /api/knowledge-sources` (`knowledge-source.controller.ts`). After the row is saved and the 201 response is sent, the controller calls `kickPipelineInBackground()`, which calls `kickKnowledgeBitPipeline()` from the kick orchestrator in a detached promise. Any rejection is logged and swallowed so it never surfaces to the caller.

## Kick orchestrator (`knowledge-bit-pipeline-kick.orchestrator.ts`)

The orchestrator runs a fixed, ordered list of passes. Each pass calls an independent scan that processes all currently-claimable rows for its stage:

| Pass name | Orchestrator module |
|---|---|
| `detect` | `detect-knowledge-bits.orchestrator.ts` |
| `wh_question` | `knowledge-bit-question-generation.orchestrator.ts` |
| `fill_blank` | `knowledge-bit-fill-blank-generation.orchestrator.ts` |

Passes run in sequence. A pass failure is caught, logged, and recorded as `"failed"` in the run summary — it does not stop the remaining passes.

Concurrent kicks coalesce: if a kick arrives while a run is already in progress, a single follow-up run is queued (not a second parallel execution). At most one run is active and at most one follow-up is pending at any time.

## Passes

**detect** claims `pending` knowledge sources (up to `DETECT_BITS_BATCH_CAP = 20` per scan), sends each source's text to the Mastra extraction agent in chunks, validates the returned items, and marks the source `bits_detected`. Sources left in `processing` for more than `STALE_PROCESSING_THRESHOLD_MS = 15 min` are reset to `pending` before each scan.

**wh_question** claims approved knowledge bits that have no WH question yet (up to `QUESTION_GENERATION_CAP = 50` per scan), calls the question-generator agent (concurrency 4), and stores each accepted variant.

**fill_blank** follows the same claim-generate-store pattern for fill-in-the-blank variants.

## Extension

To add a new pass, append a `{ name, run }` entry to `KNOWLEDGE_BIT_PIPELINE_PASSES` in the kick orchestrator. The orchestrator handles ordering, error isolation, and coalescing automatically.

## Error contract

- A pass rejection does not propagate beyond the run loop — it is logged as `pass_failed` and the run continues.
- A kick rejection (e.g. the entire run loop throws) is caught in `kickPipelineInBackground` and logged as `knowledge_bit_pipeline_kick_failed`. The HTTP response has already been sent, so the caller is unaffected.
- There are no unhandled rejections from kick calls.
