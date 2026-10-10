# Plan: F-queue-lite (items 2, 10, 12, 15)

## Goal
Unscoped review serves only due or never-reviewed bits, one card per bit, with a daily new-card cap, server-computed next-interval labels on grade buttons, due/new counts, and a done-for-today screen.

## Approach
Builds on uncommitted F-core. No schema change, so nothing here is guarded. Item 11 is out, so order is review by due_at asc, then new by bit created_at asc. The brief's suspended/buried filters wait for item 17, because those columns do not exist yet.
- Queue repo (`knowledge-bit-review-queue.repo.ts`): `listKnowledgeBitReviewCards` becomes `getKnowledgeBitReviewQueue(limit, filter, {tz, now}, db)` returning `{cards, counts, newRemainingToday, nextDueAt}`.
  - Unscoped (no tagId/topicId/knowledgeBitId): current eligibility plus a window pick `row_number() over (partition by bit order by kindRank, variant.createdAt, variant.id) = 1` (kindRank: basic 0, fill_in_the_blank 1, else 2). Query A is due bits (`dueAt <= now`, dueAt asc, limit L). Query B is new bits (no schedule row, bit createdAt asc, limit `min(L - A.length, newRemainingToday)`). The reviews join and fair cycling are dropped on this path.
  - Scoped: today's query (fair cycling, no due filter, no cap) stays as a separate path.
  - Both paths select schedule ease and interval. `phase` is "new" with no schedule row, else "review".
  - Counts are per-request-scope distinct eligible bits (`count(distinct bit) filter (where ...)`, `.mapWith(Number)`): `review` is the due bits, `learning` is 0, `new` is `min(eligibleNew, newRemainingToday)` unscoped and uncapped scoped. `newRemainingToday` is `max(0, 20 - newToday)`, always global.
  - `nextDueAt` is the earliest `dueAt > now` among eligible bits in scope. Unscoped with `newRemainingToday = 0` and new bits waiting, it is the min of that and the next local midnight.
- Review repo (`knowledge-bit-review.repo.ts`): `getLocalDayWindow(tz, now, db)` returns `{startsAt, endsAt}` via `date_trunc('day', now at time zone tz) at time zone tz` (+1 day). `countNewCardsReviewedToday(startsAt, db)` counts `was_new and undone_at is null and reviewed_at >= startsAt`. Export `NEW_CARDS_PER_DAY = 20`.
- Deriver: pure `previewGradeIntervals(current, now)` calls `deriveGradeSchedule` per grade and returns `{again,hard,good,easy}` in whole seconds, so item 11 flows through.
- Typed repo, unscoped only: add `schedule null or dueAt <= now()` and the window pick, ordered by attempts, kindRank, createdAt. Scoped unchanged. Update the doc comment, which says "No scheduling state, no due list".
- Contracts: query gains `tz` (IANA, validated by `Intl.DateTimeFormat`, default "UTC", invalid gives 400). Card gains `intervalPreview`. Response is `{cards, counts:{new,learning,review}, newRemainingToday, nextDueAt: string|null}`. Route names are unchanged, so there is no router-table, router or api-server edit.

## Steps
1. `packages/shared/src/knowledge-bit-review.ts`: `intervalPreviewSchema`, `reviewCountsSchema`, `tz`, extended card and response.
2. `knowledge-bit-grade-schedule.ts` + test: `previewGradeIntervals`.
3. `knowledge-bit-review.repo.ts`: day window, new-today count, constant.
4. `knowledge-bit-review-queue.repo.ts`: restructure (scope detection, eligibility helper, scoped path, due path, new path, counts, nextDueAt; Promise.all for independent queries; under 300 lines). Update its integration test.
5. `knowledge-bit-review.controller.ts` + `knowledge-bit-review.route.test.ts`: parse tz, call the queue fn, return the object. The test mock returns the queue object.
6. `knowledge-bit-question-variant.repo.ts` + `list-next-question-variants.integration.test.ts`: typed unscoped change, doc comment, tests.
7. `anki-review-interval.ts` + test: `formatIntervalSeconds` ("<1m", "10m", "1d", "4d", "1.2mo").
8. `anki-review-grade-buttons.tsx`: take `intervalPreview`, show the label above the key hint (testid `anki-review-grade-<grade>-interval`).
9. `anki-review-counts.tsx` (new): New / Learning / Due (testids `anki-review-count-new|learning|review`).
10. `anki-review-done.tsx` (new): "Done for today" plus "Next card due <local date-time>", or a no-more-scheduled line when null (testid `anki-review-done`).
11. `anki-review.api.ts`: outcome becomes `{ok:true} & ReviewCardsResponse`; send tz.
12. `anki-review-screen.tsx`: the queryFn passes the browser tz. Show counts as server counts minus this batch's graded tally, clamped at 0, with the tally stamped by `queue.dataUpdatedAt` and ignored on a mismatch. After the last card, set `refilling`, await `invalidateQueries`, then reset the index, so the graded card 0 never flashes back. An empty queue renders the done screen instead of `anki-review-empty`.
13. `-knowledge.review.test.tsx`: extend fixtures and tests.
14. `docs/architecture/knowledge-bit/anki-review.md`: "Due queue" section (rule, cap, tz, previews, typed change), present tense.
15. Gates: `npx tsc --noEmit` per workspace, `npx vitest run` in api and web, `npm run test:integration -w @post-anki/api -- knowledge-bit-review list-next-question-variants`.

## Tests
- Deriver: previews for a new card (1d/1d/1d/4d) and a reviewed card, in seconds, clamped. Interval formatter: label boundaries.
- Queue integration (real Postgres, fixed far-future `now` to isolate days, assertions relative to seeded ids because the DB is shared): not-yet-due excluded unscoped but served by knowledgeBitId; due before new; one card per bit with fill_in_the_blank over wh_question; cap hit gives remaining 0, no new card, due still served; tz boundary (Pacific/Auckland 19 vs UTC 18 remaining); undone reviews uncounted; nextDueAt earliest future due, else next local midnight when only capped new remain. Replace the old "least-reviewed first" test.
- Typed integration: unscoped excludes not-yet-due, includes overdue and never-reviewed, serves one variant per bit (fewest attempts); scoped still serves not-yet-due. Background tests may need limit 500.
- Route test: tz forwarded, bad tz gives 400, response has counts, newRemainingToday, nextDueAt, intervalPreview.
- Web (RTL): buttons show previewed intervals after reveal; counts decrement after a grade; done screen shows next due; old empty text gone.

## Done when
- Unscoped Anki and typed queues never serve a bit with `due_at > now` or two variants of one bit; scoped queues behave as before.
- After 20 new cards graded today (learner tz), no new card is served, due cards still are, and `newRemainingToday` is 0.
- Each grade button shows its next interval; counts show and update after grading; an empty queue shows the done screen with the next due time.
- Typed doc comment and architecture doc are current; tsc, vitest and integration tests pass; no schema or migration change.

## Defaults chosen
- Renamed the repo fn to `getKnowledgeBitReviewQueue`: it returns more than cards, and all callers are in the footprint.
- Cap and tz apply to Anki only: typed has no tz, and the reviews table records only Anki grades.
- Typed per-bit pick is fewest attempts, then kindRank: preference-only would never serve wh_question.
- Scoped counts use the due rule, uncapped: scoped queues keep today's behaviour.
- Counts decrement client-side within a batch: avoids a refetch per grade.
- `nextDueAt` includes the next local midnight when capped new cards wait: otherwise done says "nothing" with cards waiting.
- Interval formatter in its own small file (pure, unit-testable); window-function pick, not JS dedupe, keeps LIMIT correct.
- Cap is the constant 20: the brief fixes it.

## Footprint
- apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.ts
- apps/api/src/knowledge-bit/knowledge-bit-grade-schedule.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts
- apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.ts
- apps/api/src/knowledge-bit/knowledge-bit-review-queue.repo.integration.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts
- apps/api/src/knowledge-bit/knowledge-bit-review.route.test.ts
- apps/api/src/knowledge-bit/knowledge-bit-question-variant.repo.ts
- apps/api/src/knowledge-bit/list-next-question-variants.integration.test.ts
- packages/shared/src/knowledge-bit-review.ts
- apps/web/src/knowledge-bit/anki-review.api.ts
- apps/web/src/knowledge-bit/anki-review-screen.tsx
- apps/web/src/knowledge-bit/anki-review-grade-buttons.tsx
- apps/web/src/knowledge-bit/anki-review-counts.tsx (new)
- apps/web/src/knowledge-bit/anki-review-done.tsx (new)
- apps/web/src/knowledge-bit/anki-review-interval.ts (new)
- apps/web/src/knowledge-bit/anki-review-interval.test.ts (new)
- apps/web/src/routes/-knowledge.review.test.tsx
- docs/architecture/knowledge-bit/anki-review.md
END-OF-REPORT
