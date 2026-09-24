# Plan — tag-mastery (Track a dynamic knowledge level per tag from scored answers)

## Goal
Given a tag id, report a mastery level (new/practicing/struggling/mastered) derived from every
scored answer against knowledge bits carrying that tag — read-time only, no new table.

## Reuse-check (done before writing any code)
- `packages/core/src/mastery/mastery-state.ts` already has a pure, generic fold:
  `applyAttemptToMasteryEntry(entry, attempt, recycleOffset)` — takes a `MasteryEntryState` +
  `{sequenceNumber, correct, isAdjacent}`, returns the next state. No DB access, no persisted
  cursor required by the function itself.
- `knowledge_bit_variant_attempts` (`apps/api/src/db/schema.ts:1146`) already has every attempt,
  one row per answer, never updated — exactly the ordered stream this fold needs.
- `tag.repo.ts`'s `listAssignmentsForNodes`/`tagAssignments` table already links a tag to
  `knowledgeBit` node ids (used by the tag-scoring item, already shipped).
- Conclusion: **read-time fold, no schema change** — Contracted tier (no auth/payment/secrets/
  migration touched), matches advisor's explicit steer for this item.

## Design
1. New repo query: for a given `tagId`, join `tagAssignments` (nodeType="knowledgeBit") →
   `knowledgeBits.id` → `knowledgeBitQuestionVariants.knowledgeBitId` →
   `knowledgeBitVariantAttempts.variantId`, ordered by `createdAt` ascending. Select
   `{score, verdict, createdAt}` per attempt.
2. New core/service function: fold the ordered attempts through `applyAttemptToMasteryEntry`,
   starting from the default entry (`status:"new", masteryStage:0, correctCountInCycle:0,
   incorrectCountInCycle:0, lastCorrectAtSequence:null, scheduledForSequence:null`).
   - `sequenceNumber` = the attempt's position in the ordered list (0-based).
   - `correct` = `verdict === "Ok"` (reuses the grader's own existing 3-way verdict, no new
     score-threshold invented).
   - `isAdjacent` = always `false` — tag-level attempts span unrelated bits/variants, so there is
     no dense stream-position notion of "adjacent" the way phrase-bank/gap-mastery have; every
     correct attempt counts toward mastery progress (matches this file's own header comment on
     `isAdjacent` being domain-specific and caller-supplied).
   - No `recycleOffset`/`scheduledForSequence` consumer in this item — nothing here schedules a
     "due" review yet (that's the next backlog item, "surface strong/weak/shallow"). The returned
     `scheduledForSequence` is simply unused by this item's caller.
3. Expose one function: `getTagMasteryLevel(tagId: string): Promise<MasteryEntryState>` (or a
   batched `getTagMasteryLevels(tagIds: string[]): Promise<Map<string, MasteryEntryState>>` if a
   caller needs more than one tag at once — batched form only, single-tag callers pass a 1-item
   array, avoiding two near-duplicate functions).
4. No new API route in this item — this is the read-time computation only. Wiring it into a
   learner-facing surface is the next backlog item ("Surface where the learner is strong/weak/
   shallow by tag and topic").

## Non-goals
- No persisted per-tag table/cursor.
- No due-list/recycling/scheduling consumer yet.
- No new HTTP endpoint or UI surfacing yet — that's the next item.
- No change to `mastery-state.ts` itself — it's already generic enough to reuse unchanged.

## Files by scenario
| Scenario | Files |
|---|---|
| Fold attempts into a mastery level per tag | new repo query (`tag.repo.ts` or a new
`tag-mastery.repo.ts`), new fold function (e.g. `packages/core/src/mastery/tag-mastery.ts` or
alongside `tag.repo.ts`), unit + integration tests |
