---
type: architecture
task: bit-background-text
tier: Guarded
---

## Non-goals

- No answer-screen UI to display `background` — deferred to a follow-up `add-item`, not built here.
- No backfill/migration of existing rows' `background` — nullable, additive, same convention as
  `embedding`/`placementSuggestion` already on this table.
- No change to fill-blank or Wh-question generation, both of which keep reading only `body`.
- No change to the biz-education distiller pipeline — confirmed separate, out of scope for this
  direction entirely.

## Data contract change

`knowledgeBits.background: text("background")`, nullable, no default — added directly after
`body` in `apps/api/src/db/schema.ts`, matching the file's existing column-grouping and comment
conventions. Generated via the project's `db:generate` script, applied via `db:migrate` — never a
hand-written migration file, never pushed directly.

`knowledgeBitDetectorResultSchema.bits` changes shape from `z.array(z.string())` to
`z.array(z.object({ text: z.string().min(1), background: z.string().nullable() }))`
(bare `.nullable()`, no `.optional()` — required for Mastra's strict structured output),
same `min(1).max(20)` array bound as before. A post-parse `sanitizeBackground` step normalizes
empty/whitespace to `null` and truncates over-500-char values, rather than rejecting the whole
detection response over one bit's out-of-range field. `runKnowledgeBitDetector`'s return type
becomes `DetectedKnowledgeBit[]` (`{ text: string; background: string | null }`), defined in
`apps/api/src/knowledge-bit/detected-knowledge-bit.ts` — not re-exported from `mastra/`, so the
repo layer never imports from the agent layer.

`DetectKnowledgeBitsDeps.detect`/`insertBitsAndMarkDetected` and `insertKnowledgeBits`/
`insertKnowledgeBitsAndMarkDetected` take the new bit shape through to persistence.
`listNextQuestionVariantsToAnswer`'s selection/`NextQuestionVariantRow` gain a nullable
`background`, flowing through the existing next-batch API with no controller/route change.

## Rollback

Fully additive: one nullable column, one optional schema field, no default and no backfill.
Reverting means dropping the column and reverting the detector/repo type changes — no data
migration required in either direction, since no existing consumer reads `background` yet.
