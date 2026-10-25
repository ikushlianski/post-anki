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

**subject_assignment** picks a subject proposal for sources that have cards but no owner-chosen subject and have not been checked (up to 10 per scan, switch `SUBJECT_ASSIGNMENT_ENABLED`). Each source goes through the existing cheap subject check (`runSubjectCheck`, same hourly cap and spend guard). High and medium confidence results are stored as-is. Low confidence and no-match sources are collected and sent in one batch to a balanced-tier agent (30 second timeout, no retries) that must answer with an offered subject alias or nothing. The proposal is stored on the source (`suggested_subject_id`, `suggested_subject_confidence`); `subject_id` is never written, a new subject is never created, and a source is checked once. When the check is disabled or out of budget the scan stops and leaves the rest unchecked. `GET /knowledge-bits/pending-review` returns `suggestedSubjectId`, `suggestedSubjectName` and `suggestedSubjectConfidence` per source, empty when the owner set a subject.

## Extension

To add a new pass, append a `{ name, run }` entry to `KNOWLEDGE_BIT_PIPELINE_PASSES` in the kick orchestrator. The orchestrator handles ordering, error isolation, and coalescing automatically.

## Error contract

- A pass rejection does not propagate beyond the run loop — it is logged as `pass_failed` and the run continues.
- A kick rejection (e.g. the entire run loop throws) is caught in `kickPipelineInBackground` and logged as `knowledge_bit_pipeline_kick_failed`. The HTTP response has already been sent, so the caller is unaffected.
- There are no unhandled rejections from kick calls.

## Failure handling and visibility

A note never ends silently. Every outcome is either cards in Knowledge triage or a visible notice there.

### Flagged cards

- Cards the validators reject are kept, not dropped. They become pending bits with `review_flag` set to the rejection code (for example `quote_not_in_source`, `bad_card`, `wrong_language`). Unsafe (`unsafe_content`) and empty cards are never kept.
- At most `FLAGGED_MAX_PER_CHUNK = 3` flagged cards are kept per chunk, deduplicated by statement.
- In a mixed lesson the clean cards stay in the normal bit and the rejected ones become a second flagged bit.
- Flagged cards are editable and approvable one at a time; approve clears the flag. Bulk approve skips them with the skip reason `needs_manual_review`, so nothing flagged enters review unseen.
- A note fails with `no_valid_items` only when a chunk gets nothing at all from the AI. Cards still in the wrong language after the strict retry are kept flagged instead of failing the note.

### Attention rules

A note needs attention when any of these hold (derived from the notes table, not stored):

- `failed`: status is failed.
- `empty_result`: finished, has no live cards, and is not marked done.
- `stuck`: still processing after `EXTRACTION_STUCK_AFTER_MS` (20 minutes).
- `rate_limited` (info only): processing under 20 minutes with failure reason `provider_rate_limited`.

`GET /knowledge-bits/pending-review/count` returns `attentionCount` next to `count`. `GET /knowledge-bits/pending-review?attention=1` adds card-less attention entries (merged into the group if the note still has cards). Without the parameter the list is unchanged, so clients that do not ask (iOS) are unaffected.

### Plain reasons

Stored failure codes are mapped to plain wording in `packages/shared/src/extraction-failure.ts` (`extractionFailureWording`, `attentionWording`, `cardFlagWording`). Unknown codes and raw error text fall back to a generic message; raw text is never shown.

### Retry, edit and retry, discard

- Retry now and Edit text and retry both call `POST /knowledge-sources/:id/regeneration`. The optional `text` (1 to 50,000 characters) replaces the note text in the same atomic claim. Pending bits, flagged included, are superseded in the same transaction; approved and rejected bits are untouched.
- The claim accepts failed and finished notes, and a note stuck in processing for over 20 minutes (takeover). A fresh processing note returns `already_running` (409). The takeover bumps the claim time so the old run fails its ownership checks and cannot write.
- Discard is `POST /knowledge-sources/:id/discards`. Without approved cards it deletes the note and all its bits. With approved cards it removes only the non-approved cards, keeps the note and approved cards, and clears the failure. Unknown notes return 404.

### Add knowledge feedback

After a note is added, the Add knowledge screen names Knowledge triage as the place problems show and refreshes the sidebar count. It then polls `GET /knowledge-sources/:id/regeneration` every 3 seconds (up to 200 polls) and shows queued, working, ready with N cards (and how many need a manual check), or needs attention with the plain reason and a link to Knowledge triage.
