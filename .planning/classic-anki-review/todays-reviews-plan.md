# Plan: Show today's reviewed cards and subjects

## Goal
A learner opens one page and sees every card they self-graded today, grouped by subject, with how many times and the last grade.

## Approach
- Read-only feature over the existing append-only `knowledge_bit_reviews` table. No schema change, no migration, no new package.
- API: `GET /knowledge-bits/reviews/today?tz=<IANA>` (sub-resource of the reviews collection; `GET /knowledge-bits/reviews` stays unrouted, so the existing router test still holds). Query is `reviewCardsQuerySchema.pick({ tz: true })`, exactly as `subject-review-due-counts.controller.ts` does.
- "Today" = the learner's local day. Reuse `getLocalDayWindow(tz, now)` from `knowledge-bit-review.repo.ts` (same window `readNewRemainingToday` uses). Web sends `browserTimeZone()` from `anki-review-session-actions.ts`. Server default stays UTC via the shared schema. Rows are `reviewedAt >= startsAt and < endsAt` and `undoneAt is null` (an undone grade did not happen).
- Grouping: one card = one knowledge bit. Each bit's subject follows the due-counts rule (placed bit -> curriculum subject, unplaced -> source subject; none or unknown -> `unsorted`). Direct subject only, no subtree roll-up, so a card appears once. Subject names come from the existing subject lookup (`getSubjectNamesByIds`, used by the suspended repo).
- Card text comes from the variant that was actually reviewed (join `knowledge_bit_question_variants` on `variantId`), so superseded variants still show what the learner saw. Per card: `knowledgeBitId`, `prompt`, `reviewCount` today, `lastGrade`, `lastReviewedAt`.
- Response (Zod, `packages/shared`): `{ day: { startsAt, endsAt }, totalReviews, totalCards, subjects: [{ subjectId, name, cardCount, reviewCount, cards: [...] }], unsorted: { cardCount, reviewCount, cards } | null, truncated }`. Subjects ordered by most recent review; cards newest first. Capped at 500 cards; `truncated` flags the cap.
- Web: new route `/knowledge/reviewed-today` modelled on `/knowledge/suspended` (route file -> screen -> presentational page, server fn in a `*.api.ts`). Entry points: a "Reviewed today" link in `anki-review-done.tsx` (the done-for-today screen) and a link on the dashboard (`dashboard-view.tsx`) next to the review counts.

## Steps
1. `packages/shared/src/knowledge-bit-reviewed-today.ts`: Zod schemas and inferred types for the response; export from `packages/shared/src/index.ts`.
2. `apps/api/src/knowledge-bit/knowledge-bit-reviewed-today.repo.ts`: `getReviewedToday({ tz, now }, db)`. Window via `getLocalDayWindow`; one query over live reviews today joined to variants, bits, topics, curricula, sources; group per bit in SQL (count, max `reviewedAt`, last grade); then group by subject in a small pure helper (keep the file under 150 lines; split the helper to `knowledge-bit-reviewed-today-grouping.ts` if needed).
3. `apps/api/src/knowledge-bit/knowledge-bit-reviewed-today.controller.ts`: `handleListKnowledgeBitReviewsToday(res, search)`; parse, 400 `invalid_input` on failure, else `sendJson(200, ...)`.
4. Wire the route: `apps/api/src/router-table.ts` (GET, string pattern `/knowledge-bits/reviews/today`, name `listKnowledgeBitReviewsToday`), `apps/api/src/router.ts` (name union), `apps/api/src/api-server.ts` (switch case).
5. `apps/web/src/knowledge-bit/reviewed-today.api.ts`: `createServerFn` GET with `{ ok: true } | { ok: false; error }` outcome and response parsing, same shape as `suspended-knowledge-bits.api.ts`.
6. `apps/web/src/knowledge-bit/reviewed-today-page.tsx` (presentational: summary line, one section per subject, card rows, `Unsorted` section, explicit empty state with `data-testid="reviewed-today-empty"` and a link to `/knowledge/review`, truncated notice) and `reviewed-today-screen.tsx` (useQuery with `browserTimeZone()`, loading and error states).
7. `apps/web/src/routes/knowledge.reviewed-today.tsx`: file route rendering the screen. Let the router tooling regenerate `apps/web/src/routeTree.gen.ts`; do not hand-edit it.
8. Links: add a `Link to="/knowledge/reviewed-today"` in `apps/web/src/knowledge-bit/anki-review-done.tsx` and in `apps/web/src/dashboard/dashboard-view.tsx`. Do not touch `knowledge-bit-review-item-actions.tsx` or other approve/reject components.

## Tests
- `apps/api/src/knowledge-bit/knowledge-bit-reviewed-today.repo.integration.test.ts` (own DB, pattern of `subject-review-due-counts.repo.integration.test.ts`): reviews inside the local day are listed; one just before local midnight and one after are excluded, using a non-UTC `tz`; undone reviews are excluded; two grades of one card give one card with `reviewCount` 2 and the later grade; placed, unplaced and subject-less bits land in the right subject or `unsorted`; no reviews returns empty groups.
- Pure grouping helper test (co-located) if step 2 splits it out: ordering and totals.
- `apps/api/src/router.test.ts`: GET `/knowledge-bits/reviews/today` resolves to the new name, DELETE `/knowledge-bits/reviews/r1` still resolves to undo, GET `/knowledge-bits/reviews` still null.
- Controller test in the style of `knowledge-bit-review.route.test.ts`: 400 on a bad `tz`, 200 passes `tz` and a `now` to the repo (repo mocked).
- `packages/shared`: schema accepts a valid payload and rejects a negative count (only if sibling schemas have tests).
- Web `apps/web/src/routes/-knowledge.reviewed-today.test.tsx` (pattern of `-knowledge.suspended.test.tsx`): subjects and cards render grouped; empty state shows; error state shows. Plus a test that `AnkiReviewDone` shows the new link.

## Done when
- Visiting `/knowledge/reviewed-today` lists today's graded cards grouped by subject with counts, in the learner's local day.
- A grade given at 23:50 local and one at 00:10 local fall on different days, whatever the server timezone.
- Undone grades never appear; each card appears once.
- The done-for-today screen and the dashboard both link to the page.
- `npx tsc --noEmit`, lint and `npx vitest run` (affected packages) are clean; no file over 300 lines.

## Defaults chosen
- Endpoint `/knowledge-bits/reviews/today`: keeps the reviews collection unrouted and mirrors `/knowledge-bits/suspended` naming.
- Local day via the `tz` query param: it is the app's existing convention (queue, new-card cap, due counts).
- Direct subject, no roll-up: a list of cards must not repeat a card under parent subjects.
- Count live reviews only: the table is append-only but undo marks `undoneAt`, which other counters already respect.
- Cap 500 cards with a `truncated` flag instead of pagination: a day's reviews are bounded, so skip paging.
- Page lives under `/knowledge/...`: sits beside `/knowledge/review` and `/knowledge/suspended`.
- No change to the review session screen: another agent is editing review-item components, and `anki-review-screen.tsx` needs no change.

END-OF-REPORT
