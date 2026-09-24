# Local todo — topic-tracking (Feed prose-sourced bits into per-topic tracking)

## Decisions to make
- How should a knowledge-bit variant answer affect `topics.progressMaturity`/`progressAttempts`
  for the bit's placed topic (when `topicId` is set)? Research this segment found the item's own
  premise doesn't hold: `progressMaturity` is fully recomputed from the topic's `gaps` list by
  `progressFromGaps` (`packages/core/src/curriculum/gap.ts:67-81`) every time the probe/socratic
  pipeline writes it (`probe.service.ts:244`, and the socratic/probe-session writers). Knowledge
  bits have no `gaps` rows, so there is no existing "per-topic scoring" surface a bit answer can
  safely add to — writing to those columns directly would be silently wiped by the next real probe
  submit (last-write-wins, full overwrite, not additive).
  - (a) Create a synthetic `gaps` row per placed knowledge bit, so the existing gap pipeline owns
    scoring it — biggest lift, reuses the most, but conflates two different content types.
  - (b) A separate bit-signal sidecar, blended into topic strength only at read time (never
    written into `topics.progress*`) — additive, no risk of clobbering, but not visible in the
    topic's own progress bar without a second read-time step.
  - (c) Read-time only, no persistence — compute topic-level bit-answer strength on demand from
    `knowledge_bit_variant_attempts` joined through `knowledge_bit_question_variants.knowledgeBitId
    = knowledge_bits.id` filtered by `knowledgeBits.topicId`, same spirit as the tag-scoring item.
- Needs a human call before implementing — this is a genuine architecture fork, not a
  pattern-following default.

## To review-clarify
- None open.

## Coding tasks
- None yet — blocked on the decision above.

## Manual steps
- None.

## Post-deploy checks
- None yet.

## Resolved
- None yet.
