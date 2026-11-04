# Anki review statistics: plan

Status: plan only, no code written. Complexity: Medium (one new read-only API area, one new web section, no new business rules).

## Business summary

The learner gets a "Review statistics" section on the existing Analytics page with three views, all optionally narrowed to one subject (including its sub-subjects):

1. Due forecast: how many cards come due on each of the next N days (plus an "overdue now" count), so they can see tomorrow's and next week's workload.
2. Retention over time: of the cards they were shown for a repeat, the share they got right (anything but Again), per day or week, so they can see whether memory is holding.
3. Answer buttons: how many times they pressed Again, Hard, Good and Easy in a chosen period.

It is read-only. It changes no scheduling, grading or streak behaviour. Day boundaries follow the learner's own timezone, so "tomorrow" means their tomorrow.

## What data exists vs what needs capture

**Facts (cited):**
- Every self-graded review is already stored, append-only, in `knowledge_bit_reviews` (`apps/api/src/db/schema.ts:1326`): `grade` (again/hard/good/easy), `was_new`, `duration_ms`, `reviewed_at`, `undone_at`, and `prev_schedule` (a snapshot of the card's schedule before the grade, including its phase and interval).
- Undo sets `undone_at` rather than deleting, so undone rows must be excluded. Rows are written by `apps/api/src/knowledge-bit/knowledge-bit-review.repo.ts:20`.
- Upcoming due dates live in `knowledge_bit_schedules` (`schema.ts:1296`): `due_at`, `phase`, `suspended_at`, `buried_until`. One row per card.
- Subject of a card is derived, not stored on the card: placed cards use their curriculum's subject, unplaced ones use their source's subject. The exact rule is already implemented in `apps/api/src/knowledge-bit/subject-review-due-counts.repo.ts:25` and the subtree helper `collectSubjectSubtreeIds` from `@post-anki/core`.
- Learner-timezone day windows already exist: the web client sends an IANA `tz` (`apps/web/src/knowledge-bit/anki-review-session-actions.ts:17`), validated in `packages/shared/src/knowledge-bit-review.ts:15`, and the API computes local-day windows in `knowledge-bit-review.repo.ts:36`.
- The existing Analytics page (`apps/web/src/routes/analytics.tsx`, `apps/web/src/analytics/analytics-dashboard.tsx`) loads three reports (digest, coverage, retention) through server functions in `apps/web/src/analytics/analytics.api.ts`. Its "retention" is mastery-based (probe sessions), a different concept from the review-based retention here. Naming must keep them apart ("Review retention").
- The streak (`apps/api/src/streak`, singleton row `user_streaks`) and `review_point_events` are not needed: they hold counters and points, not grade history. Not touched.
- Stack is single-user (singleton streak row), so there is no per-user scoping to add.

**Conclusion: grade history is already captured. No capture work and no data migration are needed for the three metrics.**

**Assumptions / to verify:**
- History only goes back to when `knowledge_bit_reviews` was introduced; older reviews cannot be recovered. Verify the earliest `reviewed_at` in the dev DB and show the real range in the UI rather than implying a full history.
- `prev_schedule` is populated for all non-new rows (the schema comment says so). Verify with a count of rows where `was_new = false` and `prev_schedule is null`; if nonzero, those rows count as "unknown phase" and are excluded from retention.
- Optional performance migration (needs a migration number, assigned later because a parallel plan also adds migrations): an index on `knowledge_bit_reviews (reviewed_at)`. The current index is `(knowledge_bit_id, reviewed_at)`, which does not help a time-range scan across all cards. Single-user volume (thousands to low hundreds of thousands of rows) makes this optional; decide at implementation by measuring. If added: generate via the existing migrate script, never push with the ORM.

## Metric definitions and SQL / aggregation approach

All queries run in one new repo module, read-only, and take `tz`, an optional `subjectId`, and a window.

Common filters: `undone_at is null`; subject scope resolved with the same case-expression as the due-counts repo, then restricted to the chosen subject's subtree ids (`id = any(subtree)`); local day = `(timestamp at time zone :tz)::date`.

**1. Due forecast (from schedules, not history)**
- Cards in `knowledge_bit_schedules` that are not suspended and not archived/deleted; apply the same eligibility the review queue uses (reuse `pickedVariants` from `knowledge-bit-review-queue-picked.repo.ts` for the one-card-per-bit rule, so the forecast cannot drift from what a session serves, same principle as the due-counts repo).
- Bucket: `due_at <= now` goes to "overdue/due now"; otherwise `(due_at at time zone :tz)::date - (now at time zone :tz)::date` gives day offset 1..N. `group by` offset, `count(*)`. Days with zero are filled in by the service so the chart has no gaps.
- Learning/relearning cards due later today count toward "today"; buried cards count on the day their burial ends (`greatest(due_at, buried_until)`).
- New (never-reviewed) cards are not in the forecast: they have no schedule row and are capped by the daily new-card limit, which is a separate number.
- Horizon: 7, 14 or 30 days (default 14), validated.

**2. Retention over time (from history)**
- Population: reviews where the card was already in the review phase (`prev_schedule->>'phase' = 'review'`). First-time learning steps and new cards are excluded because "Again" there is a normal step, not forgetting. This is Anki's "true retention" convention.
- Per bucket: `passed = count(*) filter (grade <> 'again')`, `total = count(*)`, rate = passed / total. Bucket by local day for windows up to 90 days, by local ISO week beyond that (service picks, response states the granularity).
- Each point also carries `total` so the UI can de-emphasize buckets with very few reviews (for example under 5) instead of showing a misleading 100% or 0%.
- Overall rate for the window is returned alongside the series.
- Windows: 30 days, 90 days, 1 year, all time.

**3. Answer button counts (from history)**
- `count(*) group by grade` for the window, all phases included (new and learning cards use buttons too), returned for all four grades with zeros filled. Also returns total and each grade's share. Optionally split by phase later; not in scope.

## Timezone handling

- The client sends `tz` on every request (same as the review queue), defaulting to `UTC` when missing, rejected when invalid (reuse the shared validator, moving `isValidTimeZone` into an exported shared helper rather than copying it).
- "Today" and bucket boundaries are computed in Postgres with `at time zone :tz`, so DST days are 23 or 25 hours long correctly. The API returns bucket dates as plain `YYYY-MM-DD` local dates, never UTC instants, so the browser does not re-shift them.
- Window start for history charts = local midnight N days ago, converted back to an instant for the `reviewed_at` range filter (uses the index and avoids per-row conversion in the WHERE).

## API contract (Zod in `packages/shared`)

New file `packages/shared/src/review-statistics.ts`, exported from the package index. Per project style, one endpoint per metric group is cleaner to cache and test, but one payload keeps the page to a single round trip. Decision: one endpoint, `GET /analytics/review-statistics`.

Query schema: `tz` (validated, default UTC), `subjectId` (optional), `forecastDays` (enum 7|14|30, default 14), `historyDays` (enum 30|90|365|0 where 0 = all time, default 90).

Response schema:
- `forecast`: `{ overdue: int, days: [{ date: 'YYYY-MM-DD', count: int }] }`
- `retention`: `{ granularity: 'day'|'week', overallRate: number|null, points: [{ date, total, passed, rate: number|null }] }`
- `answerButtons`: `{ total: int, counts: { again, hard, good, easy: int } }`
- `range`: `{ earliestReviewDate: string|null }` so the UI can show how far history goes.

Route registered in `apps/api/src/router-table.ts` next to the other `/analytics/*` entries; the web server function mirrors the existing pattern in `apps/web/src/analytics/analytics.api.ts` and `analytics.api-client.ts`.

## Per-subject filter

- A subject picker above the section (reuse the existing subject picker used by the knowledge browser, `knowledge-browser-subject-picker.tsx`; the exact reuse fit is checked at implementation). "All subjects" is the default.
- Selecting a subject includes its descendants (same rule as the due counts). The filter is held in the URL search param (`subjectId`) so it survives reload and can be linked; changing it refetches only the statistics, not the other Analytics reports.
- Cards with no subject appear only under "All subjects".
- An unknown or deleted `subjectId` returns empty statistics (not an error), consistent with how "unsorted" is handled today.

## Chart approach

**Fact:** `apps/web/package.json` has no chart library (deps: react, tanstack, tailwind, @xyflow/react, dnd-kit, lucide-react). The existing heat map is plain markup and Tailwind.

**Decision: plain SVG and CSS, no new dependency.** The three charts are simple: a bar chart (forecast), a line with points (retention), four horizontal bars (answer buttons). Hand-rolled SVG is small, themeable via Tailwind classes, and testable in jsdom. Pure scale/path math goes into small, separately tested helpers. If richer interaction (zoom, brush) is ever wanted, a library such as a charting package would need approval first; **no dependency is proposed here.**

Accessibility: each chart has a text summary and an accessible table fallback (`<title>`/`aria-label`, values readable without hover); tooltip is optional via native `<title>`.

## Empty states

- No reviews ever: all three panels show "No reviews yet. Do a review session and your statistics appear here" with a link to the review page.
- No reviews in the chosen window or subject: retention and buttons say "No reviews in this period" (the forecast still renders from schedules).
- Nothing due in the horizon: forecast shows a flat chart with "Nothing due in the next N days".
- Retention bucket with no review-phase reviews: gap in the line, not a zero.
- Retention with fewer than 5 reviews in a bucket: drawn lighter with its count in the tooltip.
- API failure: the section shows an inline retry message; the rest of the Analytics page still renders (load statistics separately from the existing loader so a failure cannot blank the page).

## Files by layer (entity-first, kebab-case, each under 300 lines)

Shared (`packages/shared/src`):
- `review-statistics.ts` (+ `review-statistics.test.ts`): query and response schemas.
- Export the timezone validator as a shared helper from `knowledge-bit-review.ts` or a small `time-zone.ts`.

API (`apps/api/src/review-statistics/`):
- `review-statistics.controller.ts`: parse query, call service, `sendJson`.
- `review-statistics.service.ts`: assemble the payload, fill zero days, pick weekly vs daily granularity.
- `review-statistics-forecast.repo.ts`, `review-statistics-history.repo.ts`: the SQL; split so each stays small.
- `review-statistics-subject-scope.ts`: subject subtree resolution shared by both repos (reuses the due-counts expression rather than copying it; if extracting it from the due-counts repo is cleaner, that extraction is a pure move with no behaviour change).
- Route entry in `apps/api/src/router-table.ts`; handler wiring where other analytics handlers are registered.
- Optional migration: index on `reviewed_at` (number assigned later).

Web (`apps/web/src/analytics/review-statistics/`):
- `review-statistics-section.tsx`: container, subject picker, range controls, states.
- `due-forecast-chart.tsx`, `retention-chart.tsx`, `answer-buttons-chart.tsx`: SVG/CSS charts.
- `chart-scale.ts`: pure scale and path helpers.
- Server function and client in `analytics.api.ts` / `analytics.api-client.ts`; the section is added to `analytics-dashboard.tsx` and the route in `routes/analytics.tsx` passes the initial data.

## Tests (business guarantees; vitest, co-located, `describe`/`it should`)

API integration (real Postgres lane, pattern of `subject-review-due-counts.repo.integration.test.ts`):
- should count a card due at 23:30 local time as due "today" for a New York learner even though it is already tomorrow in UTC.
- should put overdue cards in the overdue bucket and never in a future day.
- should leave suspended cards out of the forecast, and should list buried cards on the day their burial ends.
- should not count undone reviews in retention or button counts.
- should count a Hard answer on a mature card as remembered and an Again as forgotten.
- should exclude first-time learning steps from retention so a new card failed three times does not lower it.
- should include a subject's sub-subjects when filtering by subject, and exclude other subjects.
- should keep a review made at 00:30 local on the correct local day across a daylight-saving change.
- should return all four grades with zero counts when the learner has not pressed one.

Service/unit:
- should switch to weekly buckets for long windows and report the granularity.
- should fill days with no due cards as zero so the chart has no gaps.
- should return a null rate (not 0%) for a bucket with no review-phase answers.
- Schema: should reject an invalid timezone and an unsupported horizon.

Web (react-testing-library):
- should show the empty message and a link to review when there are no reviews.
- should refetch with the chosen subject and keep the rest of the Analytics page unchanged.
- should show the counts of Again/Hard/Good/Easy as text so the figures are readable without the chart.
- should keep the page usable when statistics fail to load.
- `chart-scale.test.ts`: should map a zero-height series without dividing by zero.

Seed data for manual verification: a few weeks of reviews spread across 2-3 subjects (one nested), with a mix of grades, some undone, some suspended cards, and cards due across the next two weeks.

## File ownership

- This item owns everything under `apps/api/src/review-statistics/`, `apps/web/src/analytics/review-statistics/`, and `packages/shared/src/review-statistics.ts`.
- Shared touch-points to coordinate: `apps/api/src/router-table.ts` (additive line), `apps/web/src/analytics/analytics-dashboard.tsx` and `routes/analytics.tsx` (additive section), `packages/shared/src/index.ts` (additive export), `apps/api/src/db/schema.ts` and the migrations folder only if the optional index is taken (the parallel plan also touches migrations, so the number is assigned at merge time).
- Does not touch grading, scheduling, undo, streak, or points code.

## Architecture changes

None to ownership or boundaries. One new read-only endpoint and module over existing tables. Data contract is the new shared Zod schema above. No new async boundary, service, or infrastructure.

## Risk and rollout

- Blast radius: new route and an additive section on the Analytics page; no existing behaviour changes. If the optional index migration is taken, it is a non-destructive index creation.
- Cost: queries are range scans over one user's history; the page loads them on demand only, nothing runs in the background.
- Main correctness risk is the retention definition and timezone bucketing, covered by the tests above.

## Open items (recommended defaults, none blocking)

- Retention counts only review-phase answers (recommended; matches Anki's true retention). Alternative would include learning steps.
- Weekly bucketing beyond 90 days (recommended).
- Index migration decided by measurement at implementation time.

END-OF-REPORT
