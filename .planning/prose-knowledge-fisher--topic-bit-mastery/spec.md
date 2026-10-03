---
type: spec
direction: prose-knowledge-fisher
task: "Feed prose-sourced bits into the existing per-topic knowledge tracking"
updated: 2026-10-03
---

# Spec: fold prose-sourced knowledge-bit answers into per-topic tracking

## Facts
- `topics.progressMaturity` (`apps/api/src/db/schema.ts`) is written ONLY by gap-derived probe/socratic
  sessions (`apps/api/src/probe/probe.service.ts:248`, `apps/api/src/socratic/socratic.service.ts:504`,
  `apps/api/src/probe-session/probe-session.service.ts:530`, all via `writeTopicProgress`
  (`apps/api/src/topic/topic-progress.repo.ts:24`)). Knowledge bits (prose-sourced content) have no
  write path into this column, and per this direction's own Notes, writing one is explicitly judged
  unsafe/out of scope — `progressMaturity` has its own gap-specific semantics.
- `apps/api/src/curriculum/curriculum.repo.ts:2595-2620`'s `toTopic()` builds `Topic.progress` straight
  from the stored row (`progressStatus`, `progressMaturity`, etc.) — this is the response shape the
  curriculum detail page renders.
- The exact pattern this task should mirror already exists for tags: `getTagMasteryLevels`
  (`apps/api/src/tag/tag.repo.ts:271-316`) folds every scored `knowledgeBitVariantAttempts` row
  reachable from a tag (via `tagAssignments` → `knowledgeBitQuestionVariants` →
  `knowledgeBitVariantAttempts`) into a `MasteryEntryState`, read-time only, no persisted cursor, no
  write. `foldTagMastery`/`MasteryEntryState`/`DEFAULT_TAG_MASTERY_ENTRY` live in
  `packages/core/src/mastery/tag-mastery.ts` and `packages/core/src/mastery/mastery-state.ts`.
- `knowledgeBits.topicId` (set by placement, nullable) is the join key from a bit to a topic — same
  shape `listNextQuestionVariantsToAnswer`'s `topicId` filter already uses
  (`apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts:138`).

## Decision made autonomously
Earlier rounds flagged this as needing human sign-off because blending a bit-derived signal INTO
`progress.maturity` requires a design call (how to combine two different mastery signals into one
score). This unit sidesteps that exact ambiguity: it does NOT touch `progress.maturity` or any
write path. Instead it surfaces a second, separate, additive, read-time-only signal — a topic's
knowledge-bit mastery, exactly mirroring the already-shipped tag-mastery pattern — alongside the
existing gap-derived progress, never blended into it. This is the smallest safe step that still
satisfies "feed prose-sourced bits into the existing per-topic knowledge tracking": the signal now
reaches the topic level and is visible, without a blending-formula judgment call. Revisit blending
as a separate, explicitly human-signed-off follow-up if wanted later.

## Scope
- New repo function mirroring `getTagMasteryLevels`'s shape exactly, scoped by `knowledgeBits.topicId`
  instead of `tagAssignments`: fold every `knowledgeBitVariantAttempts` row for bits placed under a
  given topic into a `MasteryEntryState`, per topic id. Reuse `foldTagMastery`/`MasteryEntryState`
  from `packages/core/src/mastery/` as-is (same fold algorithm, just a different source-row query) —
  rename the shared fold function/module only if it's currently tag-specifically named in a way that
  would read wrong when reused for topics; otherwise call it from the new topic repo function
  unchanged.
- Surface it as a new, separate field on the curriculum-detail topic payload (e.g.
  `Topic.bitKnowledge: MasteryEntryState` or equivalent) — additive, never overwriting or blending
  with the existing `progress` field. Add the type in whichever `packages/shared/src/*.ts` file
  already declares `Topic` (locate it — it wasn't in `curriculum.ts` per a prior grep; check
  `packages/shared/src/topic.ts` or similar).
- Wire it into `getCurriculumDetail`'s topic-building path in `curriculum.repo.ts` alongside the
  existing tag-loading batch query (same batching discipline — no per-topic query in a loop).

## Out of scope
- Any write to `progressMaturity`/`progressStatus`/any topic column — read-time only, by design.
- Blending the two signals into one combined score — a separate, explicitly human-approved follow-up.
- Any UI/display work beyond exposing the new field on the API response (if a natural spot like a
  topic-strength badge already exists from the tag-mastery UI work, reuse its component pattern, but
  don't block this unit on building new UI if time-constrained — the API field landing is the core
  deliverable).

## Implementation order
1. Locate the real `Topic` shared-type file; add the new optional field.
2. Add the new repo fold function (mirror `getTagMasteryLevels`'s exact structure/batching).
3. Wire into `getCurriculumDetail`'s topic-building path, batched across all topics in one query.
4. Tests: a topic with zero bit attempts gets the default "new" entry; a topic with scored bit
   attempts folds correctly; a bit with no topic placement (`topicId` null) never contributes to any
   topic's score; declined topics still compute a value (filtering declined topics out of search is
   a separate, already-shipped concern — this fold itself has no opinion on release/declined state).
5. `npx tsc --noEmit` and the new/existing tests green.
