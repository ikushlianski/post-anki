# Spec — fill-blank retry-and-claim concurrency (Unit B)

## The ask
Fix two related bugs in the fill-blank generation scan: two concurrent scans can both pick up and
pay for the same bit, and a bit that fails once is excluded from every future scan forever.

## What to do
- Add a per-bit atomic claim step before the LLM call: `UPDATE ... WHERE id=? AND not already
  generated/exhausted AND (unclaimed OR claim gone stale) SET claimedAt=now() RETURNING id`,
  mirroring the existing claim-then-act convention in
  `knowledge-bit-placement.repo.ts:resolvePlacementSuggestion`. A scan that loses the race for a
  bit skips it without ever calling the LLM — this is what stops double-charging.
- Add a retry budget: an attempts counter incremented on every failure. The scan's own candidate
  query keeps including a failed bit until it hits the cap, instead of excluding it the moment
  `fillBlankGenerationFailedAt` is first set.
- A stale claim (a scan that died mid-flight) must eventually become claimable again — a claim
  older than a fixed staleness window is treated the same as unclaimed.

## Files to touch
- `apps/api/src/db/schema.ts` — add `fillBlankGenerationClaimedAt` (nullable timestamp) and
  `fillBlankGenerationAttempts` (integer, default 0, not null) to `knowledgeBits`.
- `apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts` — new
  `claimKnowledgeBitForFillBlankGeneration`, updated `listKnowledgeBitsForFillBlankGenerationScan`
  candidate filter, `markFillBlankGenerationFailed` increments attempts.
- `apps/api/src/knowledge-bit/knowledge-bit-fill-blank-generation.orchestrator.ts` — claim before
  calling the agent, skip (not fail) on a lost claim race.
- A new drizzle migration under `apps/api/src/db/migrations/`.
- Matching test updates in both `*.test.ts` files.

## Done when
Two scans given overlapping candidate sets never both call the LLM for the same bit, a failed bit
is retried up to the cap instead of permanently excluded, and all existing + new tests pass.
