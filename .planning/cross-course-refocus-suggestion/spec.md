---
type: spec
branch: cross-course-refocus-suggestion
task: Cross-course "refocus" suggestion when priorities shift — GitHub issue #70
complexity: medium
state: confirmed
updated: 2026-07-31
---
# Spec: Cross-course refocus suggestion

### Implementation Phases

Single phase implementation — one small new table, one pure deriver pair, one
read endpoint, one dismiss endpoint, one banner component. No sequencing
dependency beyond the usual inside-out build order (see Implementation order).

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `computeCourseRefocusCandidatesForSubject` (`packages/core/src/curriculum/course-refocus.ts`) | `courses: CourseRefocusSignal[]` (ALL of one subject's courses, including `done`/`skipping` — the deriver itself filters — `id`, `order`, `createdAt`, `lastStudiedAt`, `learningStatus`), `now: Date`, `mostRecentActivityAnywhere: string \| null` (global, computed by the caller as `MAX` across topics AND phrase-bank activity, over ALL subjects — see Decisions), `thresholds` (staleDays=14, recentDays=7, activeWindowDays=3) | `CourseRefocusCandidate[]` (`curriculumId`, `reason`, `daysSinceActivity`) | 1, 2, 3, 6, 7, 8, 12, 13 |
| `isRefocusSuppressedByDismissal` (`packages/core/src/curriculum/course-refocus.ts`) | `dismissedAt: string \| null`, `now: Date`, `cooldownDays` (default 7) | `boolean` | 4 |

**Explicit rules encoded in `computeCourseRefocusCandidatesForSubject`** (each
was a critique finding on the draft of this plan — see Decisions for the
full reasoning on each):
1. Filter to eligible courses (`learningStatus` not `done`/`skipping`)
   *first*; `topBandSize = max(1, ceil(eligibleCount / 3))` is computed over
   that filtered count, never the subject's raw course count (Scenario 13).
2. `daysSinceActivity = daysBetween(lastStudiedAt ?? createdAt, now)` — a
   never-studied course falls back to its creation date, so an old,
   untouched, rank-1 course is still flagged, never silently exempted for
   lacking a `lastStudiedAt` (Scenario 1).
3. Rank is read directly off the stored `order` value — no re-normalization
   or dense-rank recomputation; ties/gaps inherited from #69's own accepted
   tie-breaking behavior pass through unchanged.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| 1 — Stale top-priority course, learner active elsewhere | `packages/core/src/curriculum/course-refocus.ts`, `apps/api/src/curriculum/course-refocus.repo.ts` | `apps/web/src/curriculum/course-refocus-banner.tsx` | None |
| 2 — New high-priority course, unattended | `packages/core/src/curriculum/course-refocus.ts`, `apps/api/src/curriculum/course-refocus.repo.ts` | `apps/web/src/curriculum/course-refocus-banner.tsx` | None |
| 3 — No suggestion when quiet everywhere | `packages/core/src/curriculum/course-refocus.ts` | None | None |
| 4 — Dismiss hides, cooldown expires, resurfaces | `packages/core/src/curriculum/course-refocus.ts`, `apps/api/src/curriculum/course-refocus.repo.ts`, `apps/api/src/curriculum/course-refocus.controller.ts`, `apps/api/src/router.ts`, `apps/api/src/server.ts` | `apps/web/src/curriculum/course-refocus-banner.tsx`, `apps/web/src/curriculum/curriculum.api.ts`, `apps/web/src/curriculum/api-client.ts` | `apps/api/src/db/schema.ts`, new migration |
| 5 — Real study activity self-heals, no resolve step | `apps/api/src/curriculum/course-refocus.repo.ts` (no accept/resolve function exists at all — verified absence) | None | None |
| 6 — Done/skipping courses excluded | `packages/core/src/curriculum/course-refocus.ts` | None | None |
| 7 — Language-practice subjects excluded | `apps/api/src/curriculum/course-refocus.repo.ts` | None | None |
| 8 — Single-course subject is its own top priority | `packages/core/src/curriculum/course-refocus.ts` | None | None |
| 9 — Banner is non-blocking, failed fetch degrades silently | None | `apps/web/src/routes/index.tsx`, `apps/web/src/curriculum/course-refocus-banner.tsx` | None |
| 10 — Fixed small number of reads, no fan-out, no LLM | `apps/api/src/curriculum/course-refocus.repo.ts`, `packages/core/src/curriculum/course-refocus.ts` | None | None |
| 11 — Dismiss write is idempotent | `apps/api/src/db/schema.ts`, `apps/api/src/curriculum/course-refocus.repo.ts` | None | new migration |
| 12 — Multiple simultaneous stale courses in one subject's top band | `packages/core/src/curriculum/course-refocus.ts` | `apps/web/src/curriculum/course-refocus-banner.tsx` | None |
| 13 — Subject with zero eligible courses produces zero candidates | `packages/core/src/curriculum/course-refocus.ts` | None | None |
| 14 — Phrase-bank activity counts toward the global "still active" gate | `apps/api/src/curriculum/course-refocus.repo.ts` | None | None |

### Files to create

```
apps/api/src/db/migrations/
└── 00XX_<drizzle-generated-name>.sql   — creates course_refocus_dismissals
                                           (id, curriculum_id, reason,
                                           dismissed_at, unique(curriculum_id, reason));
                                           adds composite index
                                           topics(curriculum_id, progress_last_interacted_at)
                                           (verified: does not exist today) —
                                           keeps the per-curriculum last-studied
                                           aggregate cheap as topics grow

packages/core/src/curriculum/
└── course-refocus.ts                   — computeCourseRefocusCandidatesForSubject,
                                           isRefocusSuppressedByDismissal (pure,
                                           no I/O, no wall-clock read internally —
                                           `now` always passed in)
└── course-refocus.test.ts              — vitest coverage for Scenarios 1, 2, 3,
                                           4, 6, 8, 12, 13 (subject-kind filter
                                           tested at the repo layer instead — see
                                           below)

apps/api/src/curriculum/
└── course-refocus.repo.ts              — listCourseRefocusSuggestions()
                                           (fetches subjects/curricula/topics-
                                           aggregate/phrase-bank-aggregate/
                                           dismissals, excludes language-practice
                                           subjects from candidate generation
                                           while still including their
                                           phrase-bank activity in the global
                                           gate, groups by subject, calls the
                                           pure deriver per subject, joins in
                                           dismissal state),
                                           dismissCourseRefocusSuggestion()
                                           (upsert on curriculum_id+reason,
                                           compound onConflictDoUpdate target —
                                           this codebase's first compound-key
                                           upsert, same idiom as the existing
                                           single-column ones in
                                           streak.repo.ts/lecture.repo.ts/
                                           domain-map.repo.ts)
└── course-refocus.repo.test.ts         — Scenarios 7, 11, 14; Scenario 10's
                                           "fixed, small query count" claim is
                                           verified by code review, not a
                                           runtime assertion (see Definition of
                                           Done)
└── course-refocus.controller.ts        — handleGetCourseRefocusSuggestions,
                                           handleDismissCourseRefocusSuggestion

apps/web/src/curriculum/
└── course-refocus-banner.tsx           — CourseRefocusBanner: renders one
                                           dismissible card per suggestion,
                                           names the course/subject and the
                                           reason in plain language
└── course-refocus-banner.test.tsx      — RTL: renders N cards for N
                                           suggestions including 2+ from the
                                           same subject (Scenario 12), dismiss
                                           removes the card and calls the
                                           mutation (Scenario 4), empty/failed
                                           list renders nothing (Scenario 9)
```

### Files to modify

```
apps/api/src/db/schema.ts                          — new courseRefocusDismissals
                                                        table (plain text columns,
                                                        no .references() FK, same
                                                        convention as
                                                        domain_priority_suggestions);
                                                        new composite index on
                                                        topics(curriculum_id,
                                                        progress_last_interacted_at)
apps/api/src/router.ts                              — new RouteNames
                                                        "listCourseRefocusSuggestions" +
                                                        "dismissCourseRefocusSuggestion";
                                                        GET /course-refocus-suggestions,
                                                        PUT /curricula/:id/refocus-dismissals/:reason
                                                        (a nested sub-resource, not a
                                                        verb-suffixed action — see
                                                        Decisions)
apps/api/src/server.ts                              — import + switch cases for both
packages/shared/src/curriculum.ts                   — courseRefocusReasonSchema
                                                        (z.enum(["stale_top_priority",
                                                        "new_high_priority_ignored"])),
                                                        courseRefocusSuggestionSchema
                                                        (curriculumId, subjectId,
                                                        curriculumName, subjectName,
                                                        reason, daysSinceActivity) —
                                                        no separate dismiss-input schema
                                                        needed, since curriculumId and
                                                        reason are both path params on
                                                        the PUT route, not a body

apps/web/src/curriculum/curriculum.api.ts           — new getCourseRefocusSuggestions
                                                        and dismissCourseRefocusSuggestion
                                                        server fns
apps/web/src/curriculum/api-client.ts               — matching fetch calls
                                                        (GET + PUT, curriculumId/
                                                        reason as path segments, no
                                                        body), same
                                                        apiBaseUrl()/authHeaders()
                                                        pattern as every other call
                                                        in this file
apps/web/src/curriculum/model.ts                    — CourseRefocusSuggestion type
                                                        (re-exported/aliased from
                                                        @post-anki/shared, matching
                                                        how Curriculum/Tag are
                                                        already handled here)
apps/web/src/routes/index.tsx                       — Home's loader fetches
                                                        getCourseRefocusSuggestions()
                                                        alongside getBoard() via
                                                        Promise.all (not sequential
                                                        awaits); HomeView renders
                                                        <CourseRefocusBanner /> above
                                                        the subjects list; a fetch
                                                        failure/empty result renders
                                                        nothing, never an error state
```

### Data model changes

One new table:

```
course_refocus_dismissals
  id:            text, primary key
  curriculum_id: text, not null
  reason:        text, not null   -- "stale_top_priority" | "new_high_priority_ignored"
  dismissed_at:  timestamp with time zone, not null, default now()

  unique index on (curriculum_id, reason)
```

One new index on an existing table (verified: does not already exist):

```
create index on topics (curriculum_id, progress_last_interacted_at)
```

Needed because `listCourseRefocusSuggestions()` runs a
`MAX(progress_last_interacted_at) GROUP BY curriculum_id` aggregate on every
home-page load — without this index that degrades to a full scan as `topics`
grows; with it, the aggregate stays cheap regardless of row count.

No changes to `curricula`, `topics` (columns), `phrase_bank_entries`, or any
other existing table's shape — every signal this feature reads
(`curricula.order`, `curricula.createdAt`, `curricula.learningStatus`,
`topics.progressLastInteractedAt`, `phraseBankEntries.lastCorrectDate`,
`phraseBankEntries.updatedAt`, `subjects.kind`) already exists in the schema
today.

### Documentation changes

Same established local convention #69 already followed (see that plan's own
"Documentation changes" section): this repo's `docs/architecture/` is a flat,
per-feature layout generated post-build by `/debrief`, not the domain/
component taxonomy the generic constitution rule describes as its default.
Per "local rules extend, not override," no architecture doc is written by
this plan itself. Once built, `/debrief` will write
`docs/architecture/cross-course-refocus-suggestion/` (an `as-built.mmd` +
`review.md`), consistent with every other entry in that folder.

### BAML test coverage

Not applicable — no BAML functions touched, and no LLM/agent call of any kind
is part of this feature (see Decisions below for why that's a deliberate
departure from the `domain_priority_suggestions` prior art, not an oversight).

### Decisions made autonomously

- **The "decide" mechanism is a pure deterministic function, never an LLM
  call — the single most consequential decision in this plan.**
  `domain_priority_suggestions` calls an agent because "what target depth
  should this topic have" is a genuinely subjective judgment about a domain
  tree. "This course sits at the top of its subject's order and hasn't been
  touched in 14 days" has no judgment call in it — it's a quantitative
  comparison over timestamps already in the schema. Spending an LLM call on
  it would violate this repo's own cost-discipline precedent (the
  domain-priority-review plan explicitly treats "never a per-node fan-out"
  as a cost-discipline decision) for zero benefit. Confirmed this isn't a
  novel pattern for this codebase either: `isDomainPriorityReviewDue`
  (`packages/core/src/domain-map/domain-priority-review-due.ts`) is already a
  pure, wall-clock-taking deriver that gates a suggestion-adjacent banner
  ("reviewed in over 30 days") inside the one feature that otherwise *is*
  LLM-driven — proof this codebase already separates "is this due/stale"
  timing logic from "what should the AI suggest" reasoning, even within a
  single feature.
- **Only a dismissal record is persisted — the suggestion's content is never
  stored.** `domain_priority_suggestions` stores full suggestion rows because
  regenerating them costs an LLM call. Here, regenerating the suggestion
  costs one cheap aggregate query, so storing content would let it drift
  stale (a stored "hasn't been touched in 14 days" string would keep saying
  14 days forever) for no benefit over just recomputing live on every read.
  What genuinely needs to survive a page reload is the learner's own
  decision to dismiss — that's the only state this feature owns
  (`course_refocus_dismissals`).
- **The "learner is still active" gate is computed globally, across every
  subject, while the priority-rank check stays scoped to one subject at a
  time.** The issue's own framing ("one day I want to learn X, the next day
  I need to switch to Y") is about attention shifting, which happens across
  subjects, not just across courses within one. A course can only be
  "top-priority" relative to its own subject's order (no cross-subject order
  concept exists, matching #69's own scope decision), but whether the
  learner "is still around at all" has to look across everything they study,
  or a learner deep in "Spanish" while neglecting a top course in "Backend
  Engineering" would never get flagged — the exact case this issue asks for.
- **`new_high_priority_ignored` requires strict rank 1 (not the wider
  top-band used for staleness) and is scoped to genuinely new courses only,
  via `createdAt`.** There is no `orderChangedAt`/"order last touched"
  timestamp anywhere in the schema, and adding one wasn't asked for and
  isn't needed elsewhere — so this trigger cannot distinguish "just dragged
  to rank 1" from "has always been rank 1." Scoping it to `createdAt` within
  `recentDays` keeps the trigger honest: it only fires for courses that are
  actually new. A pre-existing course freshly dragged to the top without
  being studied yet is not covered by either trigger until it also
  crosses `staleDays` — flagged as a known gap, not silently pretended to be
  covered, and tracked as a follow-up in `todo.md`.
- **A fresh-eyes `/grill-plan-ie` pass (forked subagent, no access to this
  planning conversation) found six concrete gaps in the first draft of this
  plan — all incorporated below rather than left as caveats:**
  1. The `daysSinceActivity` fallback for a never-studied course was never
     written down as an explicit rule. Fixed: `daysSinceActivity =
     daysBetween(lastStudiedAt ?? createdAt, now)`, stated directly in the
     Derivers table above, with a dedicated test.
  2. `topBandSize` was ambiguous between "computed over all courses" vs
     "computed over eligible (non-`done`/`skipping`) courses" — a subject
     with 6 done courses and 3 active ones gets a materially different band
     size either way. Fixed: eligible count only, matching "excluded before
     any rank check runs" read literally — added Scenario 13 to lock this in.
  3. The original `/dismiss` path (`PATCH /course-refocus-suggestions/dismiss`)
     was an RPC-style verb suffix — exactly the pattern this project's own
     REST convention forbids, and a step backward from this same codebase's
     one-feature-prior precedent (`PATCH /domain-priority-suggestions/:id`,
     no verb). Fixed: `PUT /curricula/:curriculumId/refocus-dismissals/:reason`
     — a nested sub-resource, idempotent by construction, matching "the
     entity is the endpoint."
  4. The "learner is still active" gate was scoped only to
     `topics.progressLastInteractedAt`, silently excluding
     `language-practice` subjects (which have no `topics` rows at all —
     their activity lives in `phraseBankEntries`). A learner who studies
     exclusively via phrase drilling would have read as globally inactive,
     suppressing every banner everywhere. Fixed: the global signal unions
     both activity models (see architecture.md) — added Scenario 14.
  5. The subject-kind filter was originally an allow-list
     (`kind === 'architecture-mentor'`), which only happens to be correct
     because the enum has exactly two values today; a future third `kind`
     would silently fall through as excluded. Fixed: written as a deny-list
     (`kind === 'language-practice'` excluded) so a new kind defaults to
     included.
  6. No composite index exists on `topics(curriculum_id,
     progress_last_interacted_at)` (verified) — without one, the
     per-curriculum last-studied aggregate this feature runs on every
     home-page load degrades to a full scan as `topics` grows. Fixed: added
     to the same migration as the new table.

  Two findings were reviewed and accepted as-is, not changed: rank is read
  directly off `curricula.order`'s stored value with no re-validation of
  #69's own accepted ties/gaps (stated explicitly above rather than left
  implicit), and a dismiss-then-immediate-reload race is a single-user,
  self-correcting eventual-consistency blip not worth added client
  complexity (noted in `todo.md`, not treated as a bug).
- **`staleDays = 14`, `recentDays = 7`, `activeWindowDays = 3`, top-band
  size = `max(1, ceil(subjectCourseCount / 3))`.** No stronger existing
  convention was found in this codebase for "how long is too long to ignore
  a course" (the only comparable precedent, `isDomainPriorityReviewDue`'s
  30-day threshold, answers a different question — review cadence for an
  entire domain map, not per-course neglect — so it wasn't reused as-is).
  14 days is long enough that a normal multi-day gap between study sessions
  doesn't trigger noise, short enough to be useful. 7 days for "recent"
  and "dismissal cooldown" both read naturally as "about a week." 3 days
  for "still active" is short enough that it genuinely means "using the app
  right now," not just "used it sometime this month." All four are named
  constants in one place (`course-refocus.ts`), not scattered magic numbers,
  and are trivially reversible if real usage shows they're off.
- **`done` and `skipping` courses are excluded from both triggers before any
  rank/timestamp check runs.** A finished or deliberately-skipped course
  is a resolved state, not a neglected one — nagging about it would be
  noise, not a useful nudge.
- **`language-practice`-kind subjects are excluded entirely**, mirroring
  #69's own exclusion of this subject kind from course-level ordering UI
  (`subject-section.tsx`'s `kind === 'architecture-mentor'` gate) — those
  subjects don't participate in the `curricula.order` ordering story at all.
- **No accept/resolve endpoint exists — dismissal is the only write path.**
  Unlike `domain_priority_suggestions` (where "accept" writes the suggested
  depth onto the node), there is nothing to "apply": the suggestion is
  "go study this," and the system finds out the learner did via
  `topics.progressLastInteractedAt` updating through the existing study
  flow, not through a dedicated resolve call. This mirrors this codebase's
  existing self-healing posture (e.g. #69's accepted, un-fixed `nextOrder`
  tie: "not fixed here — it's inherited... a tie is self-healing").
- **Dismissal cooldown = 7 days, and re-dismissing resets it.** Chosen to
  match `recentDays` for one-less-magic-number-family reasoning; a dismissed
  suggestion that's still true a week later is worth surfacing again rather
  than staying silenced indefinitely from one click.
- **New dedicated files (`course-refocus.repo.ts`/`.controller.ts`), not
  folded into `curriculum.repo.ts`/`curriculum.controller.ts`.**
  `curriculum.repo.ts` is already large (1600+ lines observed directly) and
  this repo's own file-size convention (kept under ~300 lines, ideally
  ~150) argues against growing it further for a feature with its own clear
  entity boundary (a suggestion, not a curriculum mutation).
- **Endpoint is global (no `:subjectId` in the path), not per-subject.**
  This app has no multi-user concept anywhere in the schema (verified: no
  `userId`/`user_id` column exists) — a single learner's home page always
  wants "every suggestion across every subject" in one call, matching how
  `getBoard()` already fetches all subjects/curricula unscoped.
- **Banner does not deep-link to the exact subject section on the page** —
  `SubjectSection` has no anchor/id today, and adding one is a small but
  separate UI concern from this feature's actual job (informing, not
  navigating). The banner names the course and subject in plain text only;
  scroll-to-subject is a documented, lightweight follow-up in `todo.md`, not
  required for Definition of Done.
- **The banner informs; it never performs the reorder itself.** Read
  literally, the issue's "Done when" line is the fix for *today's* problem
  (nothing notices, so the learner has to both notice and act) — the fix is
  the system doing the noticing; the actual reordering stays the learner's
  manual drag action from #69, which is why that feature exists. A one-click
  "move to top" quick-action was considered and rejected as unasked-for
  scope creep — tracked in Scope boundary below, not silently added.
- **No e2e Playwright test authored in this pass**, same reasoning and same
  documented follow-up posture as #69's own plan: this repo's e2e suite is a
  separately registered project in `verification-repo` and authoring a new
  feature there is a distinct unit of work. Covered here by vitest unit
  tests on both pure derivers, a repo-level test, and an RTL component test,
  plus a documented manual verification step.
- **`docs/architecture/` update deferred to post-build `/debrief`**, per
  this repo's established convention (see Documentation changes above).
- **Auto-confirmed without human review** — this is an unattended/overnight
  run; the recommended-default rule was applied throughout instead of
  pausing for interview rounds, a fresh-eyes grill-plan pass was run and its
  findings incorporated before confirming, and the consistency gate passed
  all checks. Every decision above is reversible and pattern-following.
  Plan auto-confirmed by grand-loop (no human present to review) —
  consistency gate passed with 0 gaps [Medium path, consistency gate passed
  with 0 gaps].

### Implementation order

1. `packages/shared/src/curriculum.ts` — `courseRefocusReasonSchema`,
   `courseRefocusSuggestionSchema` (no separate dismiss-input schema needed —
   `curriculumId`/`reason` are path params on the `PUT` route, not a body).
2. `/tdd computeCourseRefocusCandidatesForSubject` +
   `/tdd isRefocusSuppressedByDismissal`
   (`packages/core/src/curriculum/course-refocus.ts`) — covers Scenarios 1,
   2, 3, 4, 6, 8.
3. `apps/api/src/db/schema.ts` — add `courseRefocusDismissals`; generate +
   run migration (`npm run db:migrate -w @post-anki/api`).
4. `apps/api/src/curriculum/course-refocus.repo.ts` —
   `listCourseRefocusSuggestions()` (subject/course/topic aggregate fetch,
   language-practice filter, per-subject deriver call, dismissal join),
   `dismissCourseRefocusSuggestion()` (upsert) — covers Scenarios 7, 10, 11.
5. `apps/api/src/curriculum/course-refocus.controller.ts` — the two
   handlers.
6. `apps/api/src/router.ts` + `apps/api/src/server.ts` — wire both routes.
7. `apps/web/src/curriculum/curriculum.api.ts` + `api-client.ts` — server
   fns + fetch calls.
8. `apps/web/src/curriculum/model.ts` — FE-side type.
9. `apps/web/src/curriculum/course-refocus-banner.tsx` — component +
   RTL test — covers Scenarios 4, 9.
10. `apps/web/src/routes/index.tsx` — loader `Promise.all` + `HomeView`
    wiring — covers Scenario 9.
11. Manual verification pass (see Definition of Done) — Scenarios 1, 2, 5.

### Scope boundary

- No cross-subject priority ranking — a course's "top priority" status is
  only ever evaluated against other courses in the same subject, matching
  #69's own scoping decision.
- No new `orderChangedAt` tracking column — `new_high_priority_ignored` is
  scoped to genuinely new courses (`createdAt`-based) only; a pre-existing
  course freshly dragged to rank 1 is a documented gap, not covered.
- No one-click "apply"/"move to top" action on the banner — it informs, the
  learner still drags manually via #69's existing UI.
- No deep-link/scroll-to-subject from the banner — plain text naming only.
- No push notification, email, or cron-based re-check — suggestions are
  computed live on every home-page load only.
- No automated e2e Playwright test in this pass — deferred, tracked in
  `todo.md`.
- `apps/mobile` is untouched — web-only, same posture as #69.
- No new `docs/architecture/` file written by this plan — deferred to a
  post-build `/debrief` pass.

### Definition of Done — per layer

**Backend**
- Migration proof: run `npm run db:migrate -w @post-anki/api` against local
  Docker Postgres, then
  `psql -c "\d course_refocus_dismissals"` — confirms the table exists with
  a unique index on `(curriculum_id, reason)`; and
  `psql -c "\d topics"` — confirms the new composite index on
  `(curriculum_id, progress_last_interacted_at)` exists.
- `npx vitest run packages/core/src/curriculum/course-refocus.test.ts` —
  asserts: a rank-1-or-better course idle past 14 days triggers
  `stale_top_priority` only when `mostRecentActivityAnywhere` is within 3
  days (Scenario 1); the same course produces no candidate when
  `mostRecentActivityAnywhere` is itself stale (Scenario 3); a `createdAt`
  within 7 days, `order === 1`, never-studied course triggers
  `new_high_priority_ignored` (Scenario 2); a course created exactly 10 days
  ago with no activity triggers neither reason (the documented dead zone);
  `done`/`skipping` courses never appear in output regardless of timestamps
  (Scenario 6); a subject with exactly one course still treats it as
  top-band (Scenario 8); a subject with 6 eligible courses produces
  candidates for BOTH rank 1 and rank 2 when both are stale, not only rank 1
  (Scenario 12); a subject where every course is `done`/`skipping` returns
  an empty array without throwing, asserting `topBandSize` was computed
  over the eligible (here, zero) count, not the raw course count (Scenario
  13); `isRefocusSuppressedByDismissal` returns `true` at day 4
  post-dismissal and `false` at day 8 (Scenario 4), with an exact
  boundary-day assertion at day 7 vs day 8.
- `npx vitest run apps/api/src/curriculum/course-refocus.repo.test.ts` —
  asserts a `language-practice`-kind subject's courses never appear in
  `listCourseRefocusSuggestions()`'s candidate output regardless of how
  stale they are (Scenario 7), while that same subject's phrase-bank
  activity still counts toward `mostRecentActivityAnywhere` — a fixture
  where the ONLY recent activity anywhere is phrase-bank drilling in a
  language-practice subject must still let a stale course in another,
  architecture-mentor subject surface (Scenario 14); calling
  `dismissCourseRefocusSuggestion()` twice for the same
  `(curriculumId, reason)` leaves exactly one row with the later
  `dismissedAt` (Scenario 11). The "small, fixed number of reads, no
  per-subject fan-out" claim (Scenario 10) is verified by code review of the
  implementation (four queries total, regardless of subject count), not by
  a runtime query-count assertion — this repo's DB tests run against a real
  local Postgres, not a mockable client, so instrumenting round-trip counts
  would need new test-only tooling not worth adding for this one claim.
  Documented here as a reviewed-not-measured proof, not silently overclaimed.
- `curl localhost:8030/course-refocus-suggestions` and
  `curl -X PUT localhost:8030/curricula/<curriculumId>/refocus-dismissals/stale_top_priority`
  against a locally running API return 200 with the expected shapes — manual
  check, documented in `todo.md`, same posture as #69's own HTTP-level manual
  check (no HTTP-level API test harness outside the e2e stack).

**Frontend**
- `npx vitest run apps/web/src/curriculum/course-refocus-banner.test.tsx` —
  RTL test proving: N suggestions (including 2 from the same subject —
  Scenario 12) render N dismissible cards; clicking dismiss on one calls the
  dismiss mutation with the correct `(curriculumId, reason)` and removes
  only that card from local state (Scenario 4); an empty or failed
  suggestions list renders nothing — no error banner, no loading spinner
  left stuck (Scenario 9).
- Manual verification (documented in `todo.md`, not automatable headlessly —
  requires manipulating real timestamps in the local dev database, which is
  faster to do directly than to script for a one-time visual check): with
  the dev server running, directly update one course's `order` to 1 and
  backdate a topic's `progress_last_interacted_at` (or leave it null) past
  the 14-day/7-day thresholds via `psql`, ensure at least one OTHER course
  anywhere has been "studied" within 3 days (update its
  `progress_last_interacted_at` to now), reload the home page, and confirm
  the banner appears with the expected course name and reason copy; dismiss
  it and confirm it disappears on reload; update `dismissed_at` in
  `course_refocus_dismissals` to 8 days ago via `psql` and confirm it
  reappears (Scenario 4); update the course's `progress_last_interacted_at`
  to now and confirm the banner disappears with no dismiss click needed
  (Scenario 5).
- No automated e2e Playwright test added in this pass (see Scope boundary)
  — a `verification-repo` follow-up is the documented gap, not silently
  skipped.

**Infrastructure**
- N/A — not touched. No new services, no IaC changes, no deploy pipeline
  changes. The only "infra-adjacent" artifact is the Postgres migration,
  covered under Backend above.
