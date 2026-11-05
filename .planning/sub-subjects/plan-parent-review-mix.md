# Plan: parent subject review mixes sub-subjects, favouring recent ones

## Goal
Reviewing a parent subject returns a balanced mix of new and already-seen cards drawn from its sub-subjects, slightly favouring the sub-subjects reviewed most recently, in an order that stays stable across refreshes.

## Facts found (verified)
- Queue entry: `getKnowledgeBitReviewQueue` in `apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts`; controller `knowledge-bit-review.controller.ts:14-33`; query/response schemas `packages/shared/src/knowledge-bit-review.ts` (`reviewCardsQuerySchema`, `reviewCardsResponseSchema`).
- Parent scope: `resolveSubjectScopeIds` (repo l.~97) expands the subject through `collectSubjectSubtreeIds` (`packages/core/src/subject-hierarchy/subject-hierarchy.ts:9`); `scopeCondition` (`knowledge-bit-review-queue-picked.repo.ts`) matches placed bits by `curricula.subjectId` and unplaced bits by `knowledge_sources.subject_id`. Card subject = `cardSubjectIdSql` (`knowledge-bit-card-subject.ts`).
- Today a subject-only scope goes through `listScopedBatch` (repo l.~99) then `listScopedCards` (`knowledge-bit-review-queue-cards.repo.ts:~105`): no due filter, no new-card cap, order = reviewCount asc, createdAt; with the `mixNewWithDue` admin setting it interleaves "seen" and "new" (`knowledge-bit-review-queue-mix.ts`). Nothing weights sub-subjects, so one big child dominates.
- Daily limit: `readDailyReviewLimit` (`...-daily-limit.repo.ts`); a subject-only scope with the limit reached returns no cards (`blocked`, repo l.~146) unless `aheadDays > 0`. The response carries `limitReached`, `reviewedToday`, `limit`.
- Activity store: `knowledge_bit_reviews` (`db/schema.ts:1468`: `reviewed_at`, `undone_at`, `knowledge_bit_id`), index on (bit, reviewed_at). Subject comes from joining the bit, as in `cardSubjectIdSql`. No per-subject activity table exists and none is needed.
- Graded-in-session fix is client-side: `withoutGradedThisSession` (`apps/web/src/knowledge-bit/anki-review-session.ts:85`) applied in `anki-review-queue-query.ts` after each fetch (batch of 10). The server already drops graded cards by schedule, so the queue must not reshuffle when one leaves.
- Consumers: only web (`anki-review.api.ts`, `anki-review-queue-query.ts`); no other client reads the queue in this repo. The response shape must stay as is.

## Approach
- Server-only change in the `knowledge-bit` module; no schema, migration, route or shared-schema change.
- When the scope is subject-only and the subject has at least two non-empty groups (each direct child's subtree, plus the parent's own cards as one group), build the page by seeded weighted selection across groups. Otherwise the existing path runs untouched.
- Weight per group = `1 + 0.5 * activity / maxActivity` (range 1 to 1.5): floor 1 means no group starves, favour is at most 50 percent. `activity` = sum over the group's reviews (undone excluded) in the last 60 days of `0.5^(ageDays/14)`, counted only up to the start of the local day, so grading during the session does not move the weights.
- Selection uses a per-card seeded key (weighted random sampling): key = `u^(1/w)`, `u` = hash(seed, variantId) in (0,1), `w` = group weight divided by the group's candidate count (so group size does not bias). Highest keys win. Keys depend only on seed and card, so removing a graded card never reorders the rest. Seed = hash(root subject id + local day start).
- Balance: a "new" pool and a "seen" pool (cards with a schedule, existing `listScopedCards(..., "seen")` order puts due ones first) are selected separately, `ceil(limit/2)` seen and the rest new, backfilling from the other pool when one runs short, then interleaved with `interleaveNewWithSeen`.

## Steps
1. `apps/api/src/knowledge-bit/knowledge-bit-review-queue-parent-mix.ts` (new, pure): constants (`HALF_LIFE_DAYS = 14`, `WINDOW_DAYS = 60`, `FAVOUR = 0.5`, `POOL_PER_GROUP = 2 * limit`), `groupWeights(activity)`, `seededUnit(seed, id)` (sha256 to number), `selectWeighted(candidates, weightOf, seed, take)`.
2. `apps/api/src/knowledge-bit/knowledge-bit-review-queue-parent-activity.repo.ts` (new): `readSubjectActivity(db, now, dayStart)` returns `Map<cardSubjectId, number>` using one grouped SQL over `knowledge_bit_reviews` joined to bit, topic, curriculum, source with `exp(-ln(2) * age_days / 14)`; window and `undone_at is null` in the where clause.
3. `apps/api/src/knowledge-bit/knowledge-bit-review-queue-parent-mix.repo.ts` (new): `listParentMixCards({ rootId, subjectRows, limit, clock, filter, db, stepsFor })`: builds groups from `subjectRows`, rolls activity up to groups, fetches each group's pools with `listScopedCards(POOL, scopeCondition(filter, db, group.ids), ..., "new" | "seen")`, selects, interleaves, returns `KnowledgeBitReviewCardRow[]`. Returns null when fewer than two groups have cards.
4. `knowledge-bit-review-queue.repo.ts`: `resolveSubjectScopeIds` also returns the loaded rows; in the `scope && filter` branch, when `subjectOnlyScope && !blocked`, try `listParentMixCards` first and fall back to `listScopedBatch` on null. Counts, `newRemainingToday`, `nextDueAt`, daily-limit fields stay exactly as they are. Keep the file under 300 lines.
5. Docs: none (no review-queue doc exists in the repo to update).

## Tests
- `knowledge-bit-review-queue-parent-mix.test.ts` (unit): weights stay in [1, 1.5] and a zero-activity group gets exactly 1; a review 14 days old counts half of a fresh one; same seed gives same order; different seed gives a different order; dropping the top card leaves the remaining order unchanged; a group with 100 candidates does not out-draw a group with 5 beyond its weight (statistical check over 500 seeds with tolerance).
- `knowledge-bit-review-queue.parent-mix.integration.test.ts` (copy the DB setup of `knowledge-bit-review-queue.subject.integration.test.ts`): parent with two children and 20 cards each, many recent reviews on child A: across seeds A's share is above B's and B's is above 0; roughly half new and half seen; two calls return identical ids; a review made today does not change the order; a graded card disappears and the rest keep their order; limit reached returns no cards and the same fields as before; a parent with one child or no children returns exactly the old order; `aheadDays` request unchanged; response parses with `reviewCardsResponseSchema`.
- Existing `knowledge-bit-review-queue.subject.integration.test.ts` and `...mix.integration.test.ts` must still pass.

## Done when
- A parent with several sub-subjects serves a mixed page of new and seen cards from several children, not one child's cards in a row.
- The recently-reviewed child gets more cards on average but every non-empty child appears over a day's sessions.
- Refreshing the page or grading a card does not reorder the remaining cards; a new local day reseeds.
- Daily limit, counts, `newRemainingToday` and the response JSON shape are unchanged; leaf and unscoped queues are byte-identical.
- `npx tsc --noEmit`, lint, and `npx vitest run` on touched files pass.

## Defaults chosen
- Groups = direct children (whole subtree each) plus the parent's own cards: matches how the dashboard nests subjects and keeps weights one level deep.
- Weight 1 to 1.5, half-life 14 days, window 60 days: "slightly favour" and a floor against starvation; tunable constants in one file.
- Activity measured up to day start: weights cannot drift during a session, which keeps the order stable.
- Seeded per-card keys, not a per-slot random draw: removal-safe, so the web refetch after each grade does not repeat the same group.
- "Learning" = any already-seen card, in the existing seen order (due and learning first): reuses `listScopedCards` rather than adding a phase sort to shared code.
- Mix applies to a parent subject always, regardless of the `mixNewWithDue` admin setting: the parent review explicitly asks for a balanced mix.
- Falls back to the old path when under two groups have cards: no behaviour change for leaves.
- Daily limit and the web graded-card filter untouched: the mix only chooses which eligible cards fill the page.
END-OF-REPORT
