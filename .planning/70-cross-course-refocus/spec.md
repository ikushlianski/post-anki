---
type: spec
branch: 70-cross-course-refocus
task: Cross-course "refocus" suggestion when priorities shift — GitHub issue #70
complexity: medium
state: confirmed
updated: 2026-08-14
---

# Spec: Cross-course refocus suggestion

## What this story is, in one paragraph

Domain-priority-review already does AI-driven re-prioritization *within* one domain map; nothing today notices "you've been ignoring course X, and course Y just became urgent" *across* courses. This feature adds a non-blocking suggestion banner to the home page that surfaces: (1) top-priority courses that have gone stale (14+ days unattended) while the learner is still active elsewhere, and (2) brand-new, high-priority courses that sit untouched for a week. Both are pure arithmetic over existing timestamps — no model call, no complex orchestration. The system surfaces the suggestion; the learner still manually re-orders via #69's existing drag-drop UI.

## Problem Statement

Post-anki users can prioritize courses within a subject via #69's drag-and-drop. But no system surfaces cross-course awareness — if you deprioritize course A to focus on course B, then forget about course B after a week, nobody notices that course A (which used to be first) is now being ignored. Same with new high-priority courses: you set one to rank 1 in a subject, but if you never touch it, the system doesn't nudge you back.

## Done when

- A course that's gone stale (rank 1–3 for its subject, unattended 14+ days), or a newly-added high-priority course (rank 1, untouched 7+ days), produces a non-blocking suggestion banner on the home page.
- Dismissing the banner suppresses it for 7 days, and can be re-dismissed (cooldown resets).
- The system auto-heals if the learner actually studies the course (no explicit "accept" or "resolve" step needed).
- Language-practice subjects are excluded entirely (they don't participate in course ordering).
- Failed fetch or no suggestions render nothing (degrade silently).

## Acceptance Criteria

### Backend

1. **Database**
   - New table `course_refocus_dismissals` with columns: `id`, `curriculum_id`, `reason`, `dismissed_at`, unique index on `(curriculum_id, reason)`, file: `apps/api/src/db/migrations/`
   - New composite index on `topics(curriculum_id, progress_last_interacted_at)` (for cheap per-curriculum last-activity aggregation)

2. **Core logic** (packages/core/src/curriculum/course-refocus.ts)
   - `computeCourseRefocusCandidatesForSubject(courses: CourseRefocusSignal[], now: Date, mostRecentActivityAnywhere: Date | null, thresholds)` — returns `CourseRefocusCandidate[]`
   - `isRefocusSuppressedByDismissal(dismissedAt: Date | null, now: Date, cooldownDays: number)` — returns `boolean`
   - Unit tests covering: stale top-priority course, new high-priority course, no suggestion when quiet everywhere, dismiss cooldown, done/skipping exclusion, single-course subject, multiple stale in same band, zero eligible courses

3. **Repository** (apps/api/src/curriculum/course-refocus.repo.ts)
   - `listCourseRefocusSuggestions()` — fetches subjects, curricula, topics aggregate, phrase-bank aggregate, dismissals; excludes language-practice subjects; groups by subject; calls pure deriver; joins dismissal state
   - `dismissCourseRefocusSuggestion(curriculumId, reason)` — upsert on `(curriculum_id, reason)` with `dismissed_at` reset

4. **Routes** (apps/api/src/router.ts, apps/api/src/server.ts)
   - `GET /course-refocus-suggestions` — returns array of cross-subject suggestions
   - `PUT /curricula/:curriculumId/refocus-dismissals/:reason` — dismisses a single suggestion

### Frontend

1. **Types** (apps/web/src/curriculum/model.ts)
   - `CourseRefocusSuggestion` type with `curriculumId`, `subjectId`, `subjectName`, `courseName`, `reason`, `dismissed_at`

2. **API layer** (apps/web/src/curriculum/api-client.ts)
   - `listCourseRefocusSuggestions()` fetch call
   - `dismissCourseRefocusSuggestion(curriculumId, reason)` mutation call

3. **Component** (apps/web/src/curriculum/course-refocus-banner.tsx)
   - Renders 0..N dismissible cards for incoming suggestions
   - Each card shows: course name, subject name, reason copy (stale/new)
   - Dismiss button calls API, removes card from local state, re-fetch on page reload
   - Empty or error state renders nothing
   - Unit tests for: multiple suggestions including 2 from same subject, dismiss interaction, empty state, error silence

4. **Home page integration** (apps/web/src/routes/index.tsx)
   - Loader fetches both `getBoard()` and `listCourseRefocusSuggestions()` in parallel
   - HomeView mounts `CourseRefocusBanner` above the subject board

## Reference Implementation Details

### Derivers — Pure Logic, Testable

**`computeCourseRefocusCandidatesForSubject`** — Input: array of all a subject's courses (including done/skipping), current time, global most-recent activity timestamp across all subjects, thresholds (staleDays=14, recentDays=7, activeWindowDays=3). Output: array of candidates with reason ("stale_top_priority" or "new_high_priority_ignored").

Encoding rules:
1. Filter to eligible courses (`learningStatus` not done/skipping) first; compute `topBandSize = max(1, ceil(eligibleCount / 3))`
2. `daysSinceActivity = days(lastStudiedAt ?? createdAt, now)` — never-studied course falls back to creation date
3. Rank read directly from stored `order` value — no re-normalization
4. Stale trigger: rank ≤ topBandSize AND daysSinceActivity ≥ 14 AND mostRecentActivityAnywhere within 3 days
5. New trigger: rank = 1 AND createdAt within 7 days AND daysSinceActivity ≥ 7 AND never-studied

**`isRefocusSuppressedByDismissal`** — Input: dismissedAt timestamp (or null), current time, cooldownDays (default 7). Output: boolean. True if within cooldown window (now - dismissedAt ≤ cooldownDays).

### Thresholds (Named Constants, All Configurable)

```
const STALE_DAYS = 14;           // How long before a course is considered neglected
const RECENT_DAYS = 7;           // What counts as "recent" for new courses & dismissal cooldown
const ACTIVE_WINDOW_DAYS = 3;    // How recently user must have done *something* for suggestion to surface
const topBandSize = max(1, ceil(eligibleCourseCount / 3));  // "Top priority" means top third
```

All live in `packages/core/src/curriculum/course-refocus.ts`, not scattered as magic numbers.

### Files by Scenario

| Scenario | Backend files | Frontend files | Infrastructure |
|----------|---------------|-----------------|---|
| 1 — Stale top-priority course | `course-refocus.ts`, `course-refocus.repo.ts` | `course-refocus-banner.tsx` | N/A |
| 2 — New high-priority course | `course-refocus.ts`, `course-refocus.repo.ts` | `course-refocus-banner.tsx` | N/A |
| 3 — No suggestion when quiet everywhere | `course-refocus.ts` | N/A | N/A |
| 4 — Dismiss hides, cooldown expires, resurfaces | All | All | migration |
| 5 — Real study activity self-heals (no resolve) | `course-refocus.repo.ts` | N/A | N/A |
| 6 — Done/skipping excluded | `course-refocus.ts` | N/A | N/A |
| 7 — Language-practice subjects excluded | `course-refocus.repo.ts` | N/A | N/A |
| 8 — Single-course subject is top priority | `course-refocus.ts` | N/A | N/A |
| 9 — Banner non-blocking, failed fetch silent | N/A | `index.tsx`, `course-refocus-banner.tsx` | N/A |
| 10 — Fixed small reads, no fan-out, no LLM | `course-refocus.repo.ts` | N/A | N/A |
| 11 — Dismiss idempotent (compound upsert) | `schema.ts`, `course-refocus.repo.ts` | N/A | migration |
| 12 — Multiple stale in top band | `course-refocus.ts` | `course-refocus-banner.tsx` | N/A |
| 13 — Zero eligible courses → empty array | `course-refocus.ts` | N/A | N/A |
| 14 — Phrase-bank activity counts to global gate | `course-refocus.repo.ts` | N/A | N/A |

## Decisions

### Decision 1: Arithmetic-only, no AI call
No ML model involved. The suggestion is deterministic over:
- Course `order` (from #69)
- Course `createdAt` and `lastStudiedAt` (existing)
- Global "most recent activity anywhere" (computed across all topics + phrase-bank per subject)
- Dismissal cooldown (new table)

Rationale: Real-time responsiveness, zero LLM cost, no hallucination risk, no latency. The suggestion is "go look at this course" not "this is what you should learn," so the bar for accuracy is lower and heuristics suffice.

### Decision 2: Thresholds are conservative (14 days is long)
14-day staleness threshold is longer than a typical multi-day study break, but short enough to catch real neglect. Chosen conservatively to avoid nagging. All four constants are named in one place and trivially reversible.

### Decision 3: Done/skipping courses excluded
A finished or deliberately-skipped course is a resolved state, not neglected — surfacing it would be noise.

### Decision 4: Language-practice subjects excluded
Those subjects don't participate in `curricula.order` ordering story (see #69's `kind === 'architecture-mentor'` gate). Their phrase-bank activity still counts toward the global "still active" gate, so a language-practice subject's activity can keep an architecture course's suggestion suppressed.

### Decision 5: No "accept" or resolve endpoint
Unlike `domain_priority_suggestions` (where "accept" writes suggested depth onto the node), there is nothing to "apply" — the suggestion says "go study this," and the system finds out via `topics.progress_last_interacted_at` updating through the normal study flow. Self-healing posture (mirrors #69's own decision on tie-breaking).

### Decision 6: Dismissal cooldown = 7 days, re-dismiss resets
Matches `RECENT_DAYS` for fewer magic numbers. A dismissed suggestion that's still true a week later is worth resurfacing.

### Decision 7: New dedicated files, not folded into curriculum.repo.ts
`curriculum.repo.ts` is already 1600+ lines. New entity boundary (a suggestion) warrants separate files following the 300-line file-size convention.

### Decision 8: Endpoint is global, not per-subject
No multi-user concept in this app. Home page wants "every suggestion across every subject" in one call (same as `getBoard()`).

### Decision 9: Banner informs; never performs the reorder itself
The fix is the system doing the noticing; the learner still manually drags via #69's UI. One-click "move to top" is documented scope-out, not silently added.

### Decision 10: No e2e Playwright test in this pass
Covered by vitest unit tests (pure derivers, repo, component) plus manual verification step. E2e test is a `verification-repo` follow-up (that project is registered separately).

## Implementation Order

1. `packages/shared/src/curriculum.ts` — `courseRefocusReasonSchema`, `courseRefocusSuggestionSchema`
2. TDD `computeCourseRefocusCandidatesForSubject` + `isRefocusSuppressedByDismissal`
3. `apps/api/src/db/schema.ts` — add `courseRefocusDismissals` table; generate + run migration
4. `apps/api/src/curriculum/course-refocus.repo.ts` — `listCourseRefocusSuggestions()`, `dismissCourseRefocusSuggestion()`
5. `apps/api/src/curriculum/course-refocus.controller.ts` — two route handlers
6. `apps/api/src/router.ts` + `server.ts` — wire routes
7. `apps/web/src/curriculum/curriculum.api.ts` + `api-client.ts` — server fns + fetch calls
8. `apps/web/src/curriculum/model.ts` — FE type
9. `apps/web/src/curriculum/course-refocus-banner.tsx` — component + RTL test
10. `apps/web/src/routes/index.tsx` — loader + HomeView wiring
11. Manual verification pass (see Definition of Done below)

## Definition of Done

### Backend

- Migration proof: `npm run db:migrate -w @post-anki/api` against local Docker Postgres; `psql -c "\d course_refocus_dismissals"` confirms table with unique index; `psql -c "\d topics"` confirms new composite index
- `npx vitest run packages/core/src/curriculum/course-refocus.test.ts` — all scenarios pass:
  - Stale rank-1 course triggers only when most-recent activity is within 3 days
  - Same course produces no candidate when most-recent activity is stale
  - Never-studied course created ≤7 days ago triggers new_high_priority_ignored
  - Course created 10 days ago triggers neither (dead zone)
  - Done/skipping courses never appear regardless of timestamps
  - Single-course subject treated as top-band
  - Multiple stale courses in top band both appear
  - Subject with all done/skipping courses returns empty array (topBandSize computed over eligible count, not raw)
  - Dismissal suppression: true at day 4, false at day 8, exact boundary at day 7 vs 8
- `npx vitest run apps/api/src/curriculum/course-refocus.repo.test.ts` — scenarios pass:
  - Language-practice subjects excluded from candidates (Scenario 7)
  - Same subject's phrase-bank activity counts to global gate (Scenario 14)
  - Re-dismissing same `(curriculum_id, reason)` leaves one row with later `dismissed_at` (Scenario 11)
  - Fixed, small query count (verified by code review, no runtime instrumentation)
- `curl localhost:8030/course-refocus-suggestions` returns 200 with expected shape
- `curl -X PUT localhost:8030/curricula/<curriculumId>/refocus-dismissals/stale_top_priority` returns 200

### Frontend

- `npx vitest run apps/web/src/curriculum/course-refocus-banner.test.tsx` — RTL tests pass:
  - N suggestions (including 2 from same subject) render N cards
  - Dismiss on one calls API with correct params, removes only that card
  - Empty/failed state renders nothing
- Manual verification (documented in todo.md):
  - Update one course's `order` to 1 and backdate `progress_last_interacted_at` past 14-day threshold via psql
  - Ensure at least one other course has been "studied" within 3 days
  - Reload home page, confirm banner appears with correct course name and reason copy
  - Dismiss, confirm disappears on reload
  - Update `dismissed_at` to 8 days ago via psql, confirm banner resurfaces
  - Update course's `progress_last_interacted_at` to now, confirm banner disappears with no dismiss click

## Scope Boundaries

- **No cross-subject ranking** — course priority only evaluated against same subject
- **No `orderChangedAt` tracking** — new-course trigger uses `createdAt` only; pre-existing courses dragged to rank 1 are not covered (documented gap)
- **No one-click "apply"/"move to top"** — banner informs; learner drags manually
- **No deep-link/scroll-to-subject** — plain text naming only
- **No push/email/cron** — computed live on home-page load only
- **No e2e Playwright test** — deferred to verification-repo follow-up
- **Web-only** — apps/mobile untouched

## Known Deviations from Reference Branch (Commit 75f0e35)

If any of the following have changed in the current codebase, update this section:
- Migration numbering scheme
- Electric sync patterns (verify that live-sync for dismissals is working as expected)
- Curriculum schema changes (verify `order` column is at expected position and behavior matches spec)
- Shared schema exports (verify courseRefocusReasonSchema location in shared types)

(TBD after reference verification against current main)
