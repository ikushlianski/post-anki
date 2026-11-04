# Home dashboard improvements: plan

Status: plan only, no code. Complexity: Medium (one small read-only API, a rebuilt home layout, no new business rules, no new dependency). The subject list and quick options stay removed.

## Current state (facts)

- The home route loads the board, sessions, learning paths, streak, 5 "most pressing topics" and per-subject due counts (`apps/web/src/routes/index.tsx:23`).
- The page is two stacked blocks. First, `HomeSubjectsAndReview` (`apps/web/src/home/home-subjects-and-review.tsx:5`) renders the title, Add knowledge button, level chip and the whole review session inline (`AnkiReviewScreen scope={{}}`). Second, `DashboardView` titled "Overview" (`apps/web/src/dashboard/dashboard-view.tsx:48`) shows continue-session, pressing topics, banners, a plain streak banner and an "Unsorted" due row.
- Counts exist only inside the review queue response (new / learning / review, `packages/shared/src/knowledge-bit-review.ts:44`). Per-subject counts come from `GET /subjects/review-due-counts` (`subjectId`, rolled-up `dueCount`, `newCount`; plus `unsorted` and `newRemainingToday`).
- Streak is `{currentStreak, longestStreak, lastActiveDate}` from `GET /streak`. There is no "reviews today" number and no per-day history endpoint.
- Every graded review is stored with its time (`knowledge_bit_reviews.reviewed_at`, undone rows flagged `undone_at`), so history needs no capture work. This is the same data the existing plan `.planning/anki-review-statistics/plan.md` relies on.
- The web app has no chart library and the project already prefers plain markup for heat maps; the web `/knowledge/review` route accepts an optional subject (`apps/web/src/routes/knowledge.review.tsx:6`), so an unscoped link studies everything.
- Unused-but-present widgets (`top-subjects-widget`, `fun-stats-widget`, `learning-list-widget`) are not mounted on home; `dashboard-subject-list` and friends are no longer used by the overview and stay unused.

## Product changes (plain language)

1. **Study-now card at the top.** Shows three big numbers: New, Learning, Due (same words and meanings as the review screen), and one large "Study now" button. Pressing it opens the normal review screen over everything that is due. When nothing is due the button is replaced by a calm "All caught up" message and the time the next card is due; if the learner has never added cards, it points to Add knowledge instead. The review session no longer runs inside the home page.
2. **Progress strip.** Right of (or below on phones) the study card: "Reviewed today" count, the current streak with a flame and best streak, and an activity calendar of the last several weeks (one small square per day, darker means more reviews, today outlined, hover/tap shows "12 reviews on Mon 20 Oct"). Days with no reviews are visibly empty, not hidden.
3. **Busiest subjects.** A tidy grid of up to 6 cards, ordered by how many cards are due, each with the subject name, its due count (including sub-subjects), a smaller "N new" hint, and a "Study" button that opens review for just that subject. Subjects with nothing due are not listed. A "See all subjects" link goes to the existing subjects page. No tree, drag, search or quick-option menus return.
4. **Kept, restyled to fit:** Add knowledge button and level chip move into the header row; continue-session card, source-approval and course-refocus banners remain but sit below the main cards so Study now stays the first thing seen. The old plain streak banner and "Unsorted" row are folded in: streak into the progress strip, Unsorted into the busiest-subjects grid as an "Unsorted" card when it has due cards (Study opens the unscoped review since unsorted has no subject filter; see risks).
5. **"Most pressing topics"**: cut from home by default because busiest subjects covers the same need. Decision flagged below.

## Data / API changes

**Reused unchanged**
- `GET /subjects/review-due-counts` for the subject cards and unsorted bucket.
- `GET /streak` for streak numbers.
- Subjects list from the board loader for names and parent filtering (only roll-up counts are used, so no child rows are shown).
- Review route and its subject scope for both buttons.

**New (flagged): one read-only endpoint `GET /home/study-overview?tz=<IANA>&days=<n>`**, owned by the existing home area on the API. Returns:
- `counts`: `{new, learning, review}` across all cards, using the exact eligibility and daily new-card limit rules the review queue uses, so the home numbers always equal what the session shows.
- `reviewedToday`: count of non-undone reviews since the learner's local midnight.
- `activity`: list of `{date: 'YYYY-MM-DD', count}` for the last N local days (default 28, max 120), zero days filled in.
- `nextDueAt`: nullable, for the all-caught-up message.
Contract is a Zod schema in `packages/shared` and a web server function in `apps/web/src/home/home.api.ts` mirroring the existing pattern. Day boundaries follow the learner's timezone, computed in the database (same approach as the review-statistics plan); the date strings are local dates and are never re-shifted in the browser.

Reuse option rather than duplicating SQL: counts and `nextDueAt` come from the same service the review queue calls (extract a counts-only function; pure move, no behaviour change). The activity query can later be shared with the review-statistics plan.

**Optional migration:** an index on `knowledge_bit_reviews(reviewed_at)` helps the day-range scan; measure first, single-user volume likely does not need it. If added, generate and run through the existing migrate script.

**New dependency:** none. Calendar is plain markup and Tailwind. No chart library is proposed.

## Build slices (each ships working, in order)

1. **Shared contract + API.** Schema in shared, extracted counts-only function, activity and reviewed-today queries, controller and route entry, server function. Done when the endpoint returns correct numbers in two timezones.
2. **Study-now card.** Counts, button, empty and all-caught-up states, load-error state. Replace the inline review on home with this card; keep the Add knowledge button and level chip in the header.
3. **Progress strip.** Reviewed-today, streak (replacing the banner), activity calendar with accessible labels and a text summary.
4. **Busiest subjects grid.** Sort, top 6, Study buttons, Unsorted card, "See all subjects" link, empty state.
5. **Layout polish and cleanup.** Single page title (the two stacked titles "Post Anki" and "Overview" become one), responsive layout (one column on phones, two columns from tablet up), banner ordering, remove the now-dead pieces from the overview (inline review wrapper, plain streak banner, unsorted row, pressing-topics block if cut). Keep unrelated unused widgets untouched.

## Tests (vitest, co-located, `describe` / `it should`)

API (real Postgres lane, pattern of the due-counts integration test):
- should show the same new, learning and due numbers on home as the review session reports for the same moment.
- should count a review done at 23:30 New York time as "today" for a New York learner even though it is already tomorrow in UTC.
- should not count undone reviews in reviewed-today or the calendar.
- should fill days with no reviews as zero and return exactly the requested number of days.
- should reject an invalid timezone and cap the days range.

Web (react-testing-library, mocks of the server functions):
- should show the three counts and a Study now button that opens the review page for everything.
- should show "All caught up" with the next due time and no Study now button when nothing is due.
- should point a learner with no cards to Add knowledge.
- should list at most six subjects with cards due, busiest first, each Study button opening review for that subject.
- should hide subjects with nothing due and show an empty message when no subject has anything due.
- should show reviewed today, current and best streak, and one calendar cell per day with its review count readable without hovering.
- should keep the page usable when the overview request fails, with an inline message and the other cards still rendered.
- should not render a subject list, search box or quick-option menu on the overview.
- Update `home-subjects-and-review.test.tsx` (it currently asserts the inline review screen) and `-index.test.tsx` for the new layout.

Manual check at implementation: phone width, a learner with 0 cards, one with 0 due, one with 500+ due.

## Open decisions (recommended defaults; proceed unless told otherwise)

- Study now opens the review page rather than running the session inline on home. Recommended: yes, the current inline session makes the home page a review screen and hides the dashboard.
- Cut "Most pressing topics" from home. Recommended: yes; reinstating it is small.
- Calendar length: 28 days (4 weeks) on home. Recommended; longer history belongs to the review-statistics page.
- Unsorted card's Study button: the review queue has no "unsorted only" scope, so it studies everything. Recommended: show the card with the due count and a note, but link to the unscoped review; a true unsorted scope would be a separate API change and is out of scope.

## Risks

- **Number mismatch:** home counts drifting from the review queue (daily new limit, burying, suspended, one card per knowledge bit). Mitigation: share the queue's counting code, plus the parity test above.
- **Timezone off-by-one** for today and the calendar. Mitigation: database-side local-day math and the New York test.
- **Streak vs reviewed-today disagreement** (streak is a stored counter updated elsewhere; reviewed-today is computed from history). Assumption to verify: that reviewing a card always records streak activity; if not, a learner could see 5 reviews and "0 day streak". Check before slice 3.
- **Activity history starts when review logging started**, so early days may look empty. Accept; do not backfill.
- **Subject roll-up:** the due count on a parent includes its sub-subjects; a parent and its child can both appear in the top 6 with overlapping cards. Mitigation: list only top-level subjects whose roll-up is highest, or accept overlap; decide at slice 4 (default: top-level subjects only, matching how roll-ups are defined).
- **Parallel work:** the review-statistics plan adds a similar history query; keep the activity query small and shareable to avoid two implementations.
- **Live data bridge:** the home page swaps loader data for live-synced data after hydration; new cards must tolerate subjects changing underneath them without remounting (same constraint as today's bridge).

END-OF-REPORT
