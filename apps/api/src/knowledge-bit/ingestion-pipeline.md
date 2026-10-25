# Knowledge-bit ingestion pipeline

## Trigger

A user pastes text, submits a batch of texts, or imports a URL via `POST /api/knowledge-sources` (`knowledge-source.controller.ts`). After the row is saved and the 201 response is sent, the controller calls `kickPipelineInBackground()`, which calls `kickKnowledgeBitPipeline()` from the kick orchestrator in a detached promise. Any rejection is logged and swallowed so it never surfaces to the caller.

## Pre-save subject check

Before the save above, the Add knowledge form asks `POST /knowledge-sources/subject-checks` for advice when the Subject is blank. A chosen subject or a preselected leaf subject sends no request; a preselected parent limits suggestions to its sub-subjects. The check is read-only and stores nothing except one LLM call log row.

- The orchestrator (`knowledge-source-subject-check.orchestrator.ts`) applies the server switch `SUBJECT_CHECK_ENABLED`, the hourly cap of 30 checks (counted from the call log), and the daily spend guard, then shortlists at most 15 leaf subjects, makes one cheap-tier agent call with a 12 second timeout, and validates the answer.
- Pasted text is untrusted. The agent sees escaped excerpts in tags and candidates as aliases (`S1`, `P1`), never real ids. Aliases that were not offered are dropped, names and reasons lose markup and line breaks, and a new-subject proposal is dropped when a high-confidence recommendation exists or its name clashes with a sibling.
- The response is always HTTP 200 for valid input: `ok` (up to three ranked recommendations and an optional new-subject proposal), `none`, or `unavailable` with reason `disabled`, `budget`, `rate_limited`, `timeout` or `failed`. Invalid input gets 400.
- The form never saves automatically. The owner taps a suggestion, accepts a proposed new subject (created through the existing create-subject call, then saved under its id), picks another subject, or adds without a subject. `none` and `unavailable` save the text unfiled with a visible notice. Declining suppresses a re-check until a block is edited.
- Saving then follows the unchanged flow above, so a subject chosen through a suggestion sets the extraction style exactly as a manual pick.

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
