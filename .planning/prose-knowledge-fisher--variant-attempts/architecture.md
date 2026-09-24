# Architecture — variant-attempts

## Non-goals, explicit
- No mastery/spaced-repetition scheduling logic lives here — that's `applyAttemptToPhraseBankEntry`
  territory for language practice specifically, and a future, separate concern for knowledge-bit
  tags/topics (tracked as its own later backlog item).
- No aggregation (per-tag score, per-topic strength) — this item only records raw attempts.
- No follow-up-question generation triggered from here — a later item reads these attempt rows to
  decide when/whether to ask a follow-up; this item only makes that possible.

## Data model
Additive-only migration: one new table, no columns added to any existing table, no existing table
touched. `variantId` stored by value (text), no DB-level foreign key — matches this schema's
established convention for cross-table references (see `gaps.topicId`,
`gapMastery.lastCorrectSessionId`, `knowledgeBits.knowledgeSourceId` in a few sibling tables).

## Concurrency
No shared mutable state — each grading call inserts exactly one new row keyed by a fresh id. No
locking, no read-compute-write cycle, unlike the phrase-bank grading path (which has to serialize
around shared mastery-entry state). Two concurrent submissions against the same variant simply
produce two independent rows — the correct behavior per Scenario 3.

## Rollback
Purely additive: drop the new table and its migration, remove the new route/controller/orchestrator/
repo/agent files. Nothing else in the app reads or writes this table yet, so rollback has zero
blast radius on existing functionality.
