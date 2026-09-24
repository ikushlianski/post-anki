---
type: architecture
direction: data-integrity-under-regeneration
task: wh-question-retry-and-claim-concurrency
---

# Architecture notes

## Pattern
Claim-then-act ownership token (random `newId()`, not a timestamp) guards a per-bit generation
pass against two concurrent scans racing on the same row. An attempts-cap counter replaces
permanent exclusion on failure, giving a bounded retry budget instead of a dead-end. This is the
same pattern already shipped for fill-blank generation, copied verbatim (renamed) for wh_question
— no new abstraction, no shared helper introduced.

## Non-goals
- Not touching the fill-blank pipeline's own files beyond the one disclosed call-site update in
  `knowledge-bit-fill-blank-mark.repo.integration.test.ts` (an unavoidable signature-compatibility
  fix, not a scope reopening of that already-stuck review slug).
- Not adding a shared cross-pipeline claim/mark/scan helper. The two pipelines (fill-blank,
  wh_question) stay independently scanned, independently claimed, independently capped — mirroring
  the pattern per-pipeline is deliberate, not an oversight; a shared generic version would need to
  parameterize over column names via dynamic SQL, which this codebase's schema/query style avoids.
- Not changing `insertQuestionVariant`, the embedding-scan functions, or the answer-queue functions
  in `knowledge-bit-question-variant.repo.ts` — they're either shared with fill-blank as-is or
  unrelated to this bug.
- Not changing the attempts cap value or the staleness window from the fill-blank pipeline's
  values (3 attempts, 10 minutes) — no stated reason for wh_question to differ.
- Not backfilling or migrating existing `whQuestionGenerationFailedAt` rows beyond what the
  additive, defaulted column naturally gives them (attempts=0, immediately retryable).

## Rollback
The migration only adds three nullable-or-defaulted columns to an existing table — no column
drops, no data rewrite, no FK changes. Rollback is reverting the application code; the schema
change carries no data-loss risk either direction (a rolled-back app version simply ignores the
extra columns, which stay harmlessly present until the next migration decides to drop them).
