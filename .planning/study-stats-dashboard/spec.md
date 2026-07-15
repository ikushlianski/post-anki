---
type: spec
branch: study-stats-dashboard
task: Per-curriculum stats page, next-step recommendation, and streaks
complexity: complex
state: confirmed
updated: 2026-07-15
---
# Spec: Study stats dashboard

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Core derivers + data model | 1, 3, 4, 5, 6 | New `packages/core` derivers (`nextStepRecommendation`, `updateStreak`); migration for `topic_recommendations` + `user_streaks` | None | **`learning-map-chat`'s `getLearningMapSnapshots()` + `LearningMapSnapshot` type must exist first** — SCENARIO 3/4's deriver takes that exact shape | N/A (unit-tested) |
| 2 — API wiring | 1, 2, 3, 4, 5, 6, 9 | New `apps/api/src/stats/` module (weak/strong query, recommendation generate+cache, next-step endpoint); new `apps/api/src/streak/` module; one-line streak call added to `probe-session.service.ts`/`socratic.service.ts`; `probe-grounding.ts` web-search call extracted into a reusable helper | None | Phase 1 | Recommendation generation is one on-demand call, never triggered by page load |
| 3 — Web frontend | 1, 2, 3, 4, 5, 6, 7, 8, 9 | None (consumes Phase 2 API) | New `curriculum.$curriculumId.stats.tsx` route; streak banner added to `dashboard.tsx`'s existing loader | Phase 2 | Loading state visible during on-demand recommendation generation |
| 4 — Regression verification | — | Confirms `probe-session.service.ts`/`socratic.service.ts` existing answer-grading logic is unchanged aside from the added streak call | None | Phases 1–3 | N/A |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `nextStepRecommendation` (`packages/core/src/curriculum/next-step.ts`, new) | `snapshots: LearningMapSnapshot[]`, `completedTopicId: string` | `{ kind: "next_level"; curriculumId; moduleId; topicId } \| { kind: "different_topic"; topicId } \| null` | SCENARIO 3, 4 |
| `updateStreak` (`packages/core/src/streak/streak.ts`, new) | `{ lastActiveDate: string \| null; today: string; currentStreak: number; longestStreak: number }` | `{ currentStreak: number; longestStreak: number; lastActiveDate: string }` | SCENARIO 5, 6 |

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | `apps/api/src/stats/stats.repo.ts` — weak spots (open gaps) + strong points (mastered topics) query for a curriculum | `apps/web/src/routes/curriculum.$curriculumId.stats.tsx` — new; link added from `curriculum.$curriculumId.tsx` | None |
| SCENARIO 2 | `apps/api/src/stats/stats.service.ts` (generate + cache), `stats.repo.ts` (`topic_recommendations` CRUD), `apps/api/src/probe/probe-grounding.ts` (extract reusable `webSearch` helper), `apps/api/src/db/schema.ts` (`topicRecommendations` table) | stats route renders cached recommendations + "Get recommendations"/"Regenerate" action | Migration: `topic_recommendations` |
| SCENARIO 3 | `packages/core/src/curriculum/next-step.ts`, `apps/api/src/stats/stats.service.ts` (exposes it) | stats route renders the suggestion | None |
| SCENARIO 4 | Same as SCENARIO 3 (same deriver, fallback branch) | Same as SCENARIO 3 | None |
| SCENARIO 5 | `packages/core/src/streak/streak.ts`, `apps/api/src/streak/streak.repo.ts` + `streak.service.ts`, `apps/api/src/db/schema.ts` (`userStreaks` table), one-line call added to `probe-session.service.ts`'s `answerProbeSession` and `socratic.service.ts`'s `answerSocraticSession` | None | Migration: `user_streaks` |
| SCENARIO 6 | Same as SCENARIO 5 (same deriver, reset branch) | None | None |
| SCENARIO 7 | `apps/api/src/streak/streak.service.ts` — read endpoint | `apps/web/src/routes/dashboard.tsx` — loader fetches streak alongside `getTree()`; new small streak-banner component | None |
| SCENARIO 8 | `stats.repo.ts` — zero-attempt case returns an explicit empty snapshot, not an error | stats route renders empty state | None |
| SCENARIO 9 | `stats.service.ts` — try/catch, same pattern as `probe-grounding.ts`'s `webGround` | stats route shows failure state, no stale-looking cache entry | None |

### Files to create

```
packages/core/src/curriculum/
  next-step.ts             — nextStepRecommendation deriver
  next-step.test.ts

packages/core/src/streak/
  streak.ts                 — updateStreak deriver
  streak.test.ts

packages/shared/src/
  next-step.ts               — nextStepRecommendationSchema
  streak.ts                  — streakSchema
  stats.ts                   — topicRecommendationSchema, curriculumStatsSchema

apps/api/src/stats/
  stats.controller.ts        — HTTP entry
  stats.repo.ts               — weak/strong query, topic_recommendations CRUD
  stats.service.ts            — orchestrates weak/strong + cached recommendation + next-step

apps/api/src/streak/
  streak.repo.ts               — read-or-create the single user_streaks row
  streak.service.ts            — recordActivityToday(now), getStreak()

apps/web/src/routes/
  curriculum.$curriculumId.stats.tsx  — new stats page

apps/web/src/curriculum/
  stats.api.ts                — createServerFn wrappers for stats/streak endpoints
  weak-strong-list.tsx        — weak spots / strong points display
  recommendation-panel.tsx    — cached recommendation + generate/regenerate action
  streak-banner.tsx           — current + longest streak display
```

### Files to modify

```
apps/api/src/
  db/schema.ts                         — + topicRecommendations table, + userStreaks table
  probe/probe-grounding.ts             — extract webGround's OpenRouter web_search call into a
                                           reusable `webSearch(query, purposeLabel)` helper used by
                                           both existing grounding and the new recommendation
                                           generator; existing `gatherProbeGrounding` behavior
                                           unchanged
  probe-session/probe-session.service.ts — answerProbeSession calls streak.service's
                                           recordActivityToday(now) after grading (additive,
                                           end of function)
  socratic/socratic.service.ts          — answerSocraticSession calls the same
                                           recordActivityToday(now) after grading (additive)

apps/web/src/routes/
  dashboard.tsx                        — loader also fetches streak state; renders StreakBanner
                                           in the header; existing tree rendering unchanged
  curriculum.$curriculumId.tsx         — adds a link to the new stats route (single line)
```

**Not modified, confirmed by direct code check:**
- `apps/api/src/curriculum/curriculum.repo.ts` — this plan consumes `getLearningMapSnapshots()`
  (owned by `learning-map-chat`) as-is, does not redefine or duplicate it.
- `apps/api/src/gap/gap.repo.ts`, `packages/core/src/curriculum/gap.ts`/`progress.ts` — weak/strong
  spot computation reuses these exactly as they are today, no changes.
- `apps/bot/src/**` — this plan is web-only; no bot-side stats/streak surface is added.

### Data model changes

Drizzle-generated migration (never hand-written), two new tables:

```
topic_recommendations
  id             text primary key
  topic_id       text not null
  text           text not null
  citations      jsonb (string[]) not null default '[]'
  generated_at   timestamp with time zone not null

user_streaks
  id                text primary key
  current_streak    integer not null default 0
  longest_streak    integer not null default 0
  last_active_date  text (nullable)
```

No changes to any existing table.

### Documentation changes

No existing doc under `docs/` covers stats/recommendation/streak architecture. Per the mandatory
rule for a plan that writes `architecture.md`: a short Mermaid diagram of this architecture will
be published to `docs/architecture/study-stats-dashboard.md` during implementation.

### Decisions made autonomously

1. **New per-curriculum route (`/curriculum/$curriculumId/stats`) rather than folding into
   `/dashboard`** — `/dashboard` is the existing subject→curriculum→module→topic navigation/
   status tree, a different job from an analytics view; the user's own framing scopes stats to
   "the [curriculum] I'm studying," which is inherently per-curriculum.
2. **Streak surfaces on `/dashboard`, not the new stats page** — a streak is a whole-learner
   concept, not scoped to one curriculum; `/dashboard` is the app's daily landing surface.
3. **Recommendation generation is a new, small `apps/api/src/stats/` module reusing
   `probe-grounding.ts`'s proven web-search call, not a rebuild of citation grounding** — the
   parallel "quiz generation fidelity" plan owns per-question citations; this is a distinct,
   coarser, topic-level "what to read next" feature using the same underlying search mechanism
   for a different purpose.
4. **`nextStepRecommendation` depends directly on `learning-map-chat`'s `getLearningMapSnapshots()`
   and `LearningMapSnapshot` type rather than a parallel aggregation query** — avoids two
   divergent cross-curriculum queries computing mastery two different ways; logged as a hard
   build-order dependency in `todo.md`.
5. **Streak trigger is "any graded answer," once per day** — the simplest definition consistent
   with "hailed for being on a streak," avoiding an invented session-completion threshold.
6. **No new date library for streak day-diff math** — follows `daily-push.ts`'s existing raw-
   `Date` arithmetic precedent; a library is unjustified for one calendar-day comparison.
7. **Recommendation gate: 2+ topics with `attempts > 0`**, not a percentage threshold — a literal
   reading of "especially if I have completed a couple of sections."
8. **`topic_recommendations` overwrites on regenerate rather than keeping history** — mirrors the
   existing `probe-session` regenerate pattern (delete + recreate); no history UI was requested.
9. **`user_streaks` is a single lazily-created row, not a per-user table** — this is a
   single-user personal app; a `userId` column and multi-row design would be premature generality.

### Implementation order

1. `/tdd nextStepRecommendation` — covers SCENARIO 3, 4 (blocked until `learning-map-chat`'s
   `getLearningMapSnapshots`/`LearningMapSnapshot` land)
2. `/tdd updateStreak` — covers SCENARIO 5, 6
3. `packages/shared` — `next-step.ts`, `streak.ts`, `stats.ts` schemas
4. `apps/api/src/db/schema.ts` — add both tables, generate + apply migration
5. `probe-grounding.ts` — extract reusable `webSearch` helper (existing `gatherProbeGrounding`
   behavior unchanged)
6. `apps/api/src/stats/` — repo + service + controller
7. `apps/api/src/streak/` — repo + service; wire `recordActivityToday` into
   `probe-session.service.ts` and `socratic.service.ts`
8. Frontend: `stats.api.ts` client wrapper
9. Frontend: `weak-strong-list.tsx`, `recommendation-panel.tsx`, `streak-banner.tsx`
10. Frontend: `curriculum.$curriculumId.stats.tsx` route; link from the curriculum page
11. Frontend: `dashboard.tsx` loader + streak banner wiring
12. Regression check: `probe-session.service.ts`/`socratic.service.ts` grading logic unchanged
    aside from the additive streak call
13. Publish `docs/architecture/study-stats-dashboard.md`

### Scope boundary

Out of scope: curriculum creation/research pipeline internals; per-question/per-option citation
grounding for the quiz itself (owned by the parallel "quiz generation fidelity" plan — this
plan's recommendations are a separate, topic-level feature using the same search mechanism, not
a shared feature); per-question/per-turn thumbs-up/down feedback and promote/demote signals
(owned by the parallel "feedback/promote-demote" plan); the sidebar chat and level-aware
generation context (owned by `learning-map-chat`, whose `getLearningMapSnapshots()` this plan
depends on); Socratic turn-by-turn mechanics and quiz scoring (reused as-is, only a one-line
streak call added); any Telegram bot UI or streak/stats surface.
