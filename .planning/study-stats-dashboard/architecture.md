---
type: architecture
branch: study-stats-dashboard
task: Per-curriculum stats page, next-step recommendation, and streaks
state: confirmed
updated: 2026-07-15
---
# Architecture: Study stats dashboard

## What changes structurally

**A new per-curriculum stats page, not a rebuild of the existing `/dashboard` navigation tree.**
`/dashboard` today is the subject→curriculum→module→topic status-editing tree — a navigation
and control surface, not an analytics view. The user's own framing ("if I have started to study
the statistics module and I see a statistics page with the main stats for my studies") scopes
this to a specific curriculum being studied, so this lands as a new route,
`apps/web/src/routes/curriculum.$curriculumId.stats.tsx`, linked from the existing curriculum
page — additive, `/dashboard` itself is untouched except for one small addition (the streak
banner, see below).

**Weak spots / strong points reuse existing progress data — no new tracking.** Weak spots are
the curriculum's `openGaps` (already computed per topic via `packages/core/src/curriculum/gap.ts`)
ranked by depth; strong points are topics already at `deriveTopicStatus`'s `mastered` threshold.
Both come from data the app already maintains via `answerProbeSession`/`answerSocraticSession`
— this page is a read/aggregate view, not a new write path.

**Recommendations are a new, small generated-content cache — not a redesign of quiz-answer
citations.** The parallel "quiz generation fidelity" plan owns per-question/per-option citation
grounding for the quiz itself; that is explicitly out of scope here. This page's "AI
recommendation" is a separate, coarser-grained thing: one short piece of text (plus, when
available, a real link) per weak-spot topic, generated on explicit user action and cached. It
reuses the exact same web-search-grounding mechanism `probe-grounding.ts`'s `webGround` already
uses (OpenRouter `web_search` tool + `collectCitations` for real URLs, never model-invented
ones) — applied to a new purpose (a topic-level "what should I read next" recommendation)
through a new, small module, `apps/api/src/stats/`, rather than duplicating logic already proven
correct in `probe-grounding.ts`. Because a result is user-triggered and persisted (not
recomputed per view), it needs one new table (see Data model evolution).

**Next-step recommendation is a pure function over the same cross-curriculum snapshot the
sibling `learning-map-chat` plan produces.** That plan's `getLearningMapSnapshots()`
(`apps/api/src/curriculum/curriculum.repo.ts`) already returns, per curriculum, a per-module
breakdown (`level`, `ModuleProgress`, per-topic `TopicProgress`) across every confirmed
curriculum. A new deriver, `nextStepRecommendation(snapshots, completedTopicId)` in
`packages/core/src/curriculum/next-step.ts`, consumes that exact shape: it first checks whether
the just-completed topic's module is fully mastered and a higher-`level` module exists in the
same curriculum (→ same-topic-next-level); if not, it falls back to the weakest not-yet-mastered
topic across all curricula at a comparable depth/level (→ different-topic-same-level), reusing
the same weakest-first comparator already established in `recommendation.ts`'s
`recommendedTopicId`. This is a genuine cross-plan dependency: `next-step.ts` cannot be
implemented/typechecked until `learning-map-chat`'s repo function and `LearningMapSnapshot` type
exist — sequencing, not a design risk (both types are already pinned down in that plan's
`spec.md`).

**Streaks are a single-row table plus a pure date-diff deriver, updated from the two existing
answer paths.** A new deriver, `updateStreak({ lastActiveDate, today, currentStreak,
longestStreak })` in `packages/core/src/streak/streak.ts`, follows the same raw
`Date`/ISO-string arithmetic already established in `daily-push.ts`'s `isStale` — no new date
library, consistent with existing precedent for one day-boundary calculation. It is called from
one new, tiny side-effecting helper, `apps/api/src/streak/streak.repo.ts`'s
`recordActivityToday(now)`, invoked once each from `answerProbeSession`
(`apps/api/src/probe-session/probe-session.service.ts`) and `answerSocraticSession`
(`apps/api/src/socratic/socratic.service.ts`) — both files already exist and already run on
every graded answer, so "any graded interaction bumps the streak" is a one-line addition at the
end of each, not a new event-tracking system.

**Streak surfaces globally, not per-curriculum.** A streak is a whole-learner concept, not scoped
to one curriculum — it belongs on `/dashboard` (the app's daily landing surface), as a small
banner using the existing loader pattern (`getTree()` already runs there; the streak fetch is
a second, parallel, cheap read added to that same loader), not on the new per-curriculum stats
page.

## New infrastructure

None. One new `apps/api` module (`stats/`), one new table, no new services, no new async
boundaries beyond the existing "API calls OpenRouter" shape already used everywhere else.

## Data model evolution

Two new tables (Drizzle-generated migration, never hand-written):

```
topic_recommendations
  id             text primary key
  topic_id       text not null
  text           text not null
  citations      jsonb (string[]) not null default '[]'
  generated_at   timestamp with time zone not null

user_streaks
  id                text primary key   -- single row, app is single-user
  current_streak    integer not null default 0
  longest_streak    integer not null default 0
  last_active_date  text               -- ISO date (YYYY-MM-DD), nullable until first activity
```

`topic_recommendations` is regenerable (a "regenerate" action deletes and re-inserts, same
pattern `probe-session`'s `regenerate` flag already uses for quiz batches) rather than
versioned/history-tracked — only the latest recommendation per topic matters. `user_streaks` is
seeded with its single row lazily on first read (no seed migration needed) rather than requiring
a manual insert step.

No changes to `curricula`, `modules`, `topics`, `gaps`, or any table owned by another plan.

## Failure modes

- **Recommendation generation fails or times out.** Same handling as `probe-grounding.ts`'s
  `webGround`: catch, log, no row written — the UI shows "couldn't generate, try again" rather
  than a half-written cache entry that renders as if it succeeded (SCENARIO 9).
- **Recommendation search returns no citation.** Rendered as text-only, no link — never a
  fabricated URL, matching the existing `collectCitations` contract (only real
  `annotations[].url_citation.url` values are ever surfaced).
- **`nextStepRecommendation` is asked about a topic whose curriculum has zero level tiers
  (`level` is `null` throughout).** Falls straight to the different-topic-same-level branch —
  there's no "next level" to detect, so the same-level fallback is the only reachable outcome,
  which is exactly what SCENARIO 4 already covers, not a special case needing extra code.
- **Streak update races within the same day (two rapid answers).** `updateStreak` is idempotent
  by design — same-day repeat calls compare `today` against the *already-updated* `lastActiveDate`
  and no-op, so no double-increment regardless of call order or timing.
- **Streak table's single row doesn't exist yet on first-ever read.** `streak.repo.ts` reads-or-
  creates the row (a default zero-state) rather than assuming a seed migration ran — first
  activity of the learner's life on this app just naturally becomes day-1 of streak 1.

## Rollout

Single deploy, no feature flag — personal single-user app. Apply the generated migration for the
two new tables before deploying the API build that reads/writes them (same
`npm run db:migrate:api` step already used in this repo's deploy flow). No data backfill needed
— both new tables start empty/lazily-seeded.
