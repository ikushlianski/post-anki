---
type: plan
direction: prose-knowledge-fisher
task: bit-background-text
tier: Guarded
updated: 2026-09-30
---

## Ask
Todo item: "Extract optional short background/clarifying text alongside Q&A from inbox content."
The knowledge-bit detector splits raw pasted prose ("inbox content") into standalone bits. A bit
can be terse enough that it loses context once split out. This adds an optional short
background/clarifying note per bit, extracted at detection time from the same source text, and
surfaces it through the existing next-batch API the answer screen already reads.

## Decisions made autonomously
- Attach point is the detector (not the downstream question generator): the detector alone still
  has the full original source text in view; a bit only carries its own already-split text
  downstream. Extracting background later would need re-fetching the source.
- Storage: one nullable `background` column on `knowledgeBits`, not a separate table — mirrors
  `placementSuggestion`'s existing nullable-optional-field convention on the same table.
- Scope stays backend-only: extract, persist, return via the existing next-batch API. No UI
  rendering of it yet — logged as a follow-up `add-item`, not built here.
- Tier: Guarded, per implement-factory's own rule — this needs a schema migration.

## Design
1. `knowledgeBitDetectorResultSchema`'s `bits` field changes from `z.array(z.string())` to
   `z.array(z.object({ text: z.string().min(1).max(2000), background: z.string().min(1).max(500).nullable().optional() }))`,
   min 1 / max 20 as before. Instructions gain one short paragraph: add `background` only when the
   bit genuinely loses meaning without nearby context from the source; omit it otherwise.
2. `runKnowledgeBitDetector`'s return type changes to match — `DetectedKnowledgeBit[]`.
3. `DetectKnowledgeBitsDeps.detect`/`insertBitsAndMarkDetected` and `insertKnowledgeBits`/
   `insertKnowledgeBitsAndMarkDetected` (knowledge-bit.repo.ts) take the new bit shape and persist
   `background` alongside `body`.
4. Schema: add `background: text("background")` (nullable) to `knowledgeBits` in schema.ts, right
   after `body`. Generate + run the migration via the existing `db:generate`/`db:migrate` scripts —
   never a hand-written migration file.
5. `listNextQuestionVariantsToAnswer`'s selection and `NextQuestionVariantRow` gain a nullable
   `background` field, so the next-batch API (already consumed by the answer screen) returns it
   without a new endpoint.

## Non-goals
- No answer-screen UI change to display `background` — a separate, later item.
- No backfill for existing bits — nullable, additive only, same convention as `embedding`/
  `placementSuggestion`.
- No change to fill-blank generation or any other consumer of a knowledge bit's `body`.

## Rollback
Fully additive (one nullable column, one optional schema field) — reverting is deleting the column
and reverting the detector schema/repo changes; no data migration needed either direction.
