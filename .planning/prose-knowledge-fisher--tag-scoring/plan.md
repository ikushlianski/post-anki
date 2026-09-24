# Score each answer against its bit's tags

## Goal
When a learner's answer to a knowledge-bit question variant is graded, attribute that score to
every tag on the bit it came from, so later work (per-tag knowledge level, strong/weak surfacing)
has a real signal to aggregate over.

## Reuse-check
- Tags-on-a-bit already exist via the generic `tagAssignments` table (`nodeType: "knowledgeBit"`),
  written by `knowledge-bit-tagging.orchestrator.ts`. No new bit-tag join table needed.
- `listAssignmentsForNodes` in `tag.repo.ts` already fetches assignments for a batch of node ids —
  reused as-is, not rebuilt.
- No new score computation — the grader's existing 0-10 score already represents how well the
  answer captures the fact; this item just attributes that same score to the bit's tags.

## Non-goals (separate, later backlog items)
- No aggregation or rolling per-tag knowledge level ("Track a dynamic knowledge-level per tag").
- No wiring into topic-side progress tracking ("Feed prose-sourced bits into the existing
  per-topic knowledge tracking").
- No UI surfacing of strong/weak tags.
- No persistence of a tag snapshot on the attempt row — tag ids are looked up live from the bit's
  current tag assignments at grading time and returned in the response, not stored as a new
  column/table. A bit's tags rarely change after tagging; if a later item needs a frozen
  per-attempt snapshot for retag-drift reasons, that's its own decision to make then.

## Design
1. `getQuestionVariantById` (`knowledge-bit-variant-attempt.repo.ts`) also selects the variant's
   `knowledgeBitId`, needed to look up the bit's tags.
2. `gradeKnowledgeBitVariantAnswer` orchestrator, after grading, calls
   `listAssignmentsForNodes([variant.knowledgeBitId])` and includes `tagIds: string[]` in its
   `{ ok: true, ... }` response — empty array if the bit has no tags yet (e.g. tagging hasn't run).
3. No new route — same `POST /knowledge-bits/question-variants/:id/answers` response now also
   carries `tagIds`.

## Files by scenario
| Scenario | Files |
|---|---|
| Grading a variant returns the tag ids of its source bit | `knowledge-bit-variant-attempt.repo.ts`, `grade-knowledge-bit-variant-answer.orchestrator.ts` |
| A bit with no tags yet returns an empty tagIds array, not an error | same |
| variant_not_found path is unaffected (no tag lookup attempted) | `grade-knowledge-bit-variant-answer.orchestrator.ts` |
| HTTP response includes tagIds | `grade-knowledge-bit-variant-answer.controller.ts` |
