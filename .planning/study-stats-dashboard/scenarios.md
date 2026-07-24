---
type: scenarios
branch: study-stats-dashboard
task: Per-curriculum stats page, next-step recommendation, and streaks
state: confirmed
updated: 2026-07-15
---
# Scenarios: Study stats dashboard

## Business Scenarios

SCENARIO 1: Stats page shows weak spots and strong points for a curriculum

Opening a curriculum's stats page shows, at a glance, which topics/concepts are weak (open
gaps, low maturity %) and which are strong (mastered topics), scoped to that curriculum.

What to verify:
- [x] Weak spots list is built from open gaps ranked by depth/importance, reusing existing
  `openGaps`/gap state, not a new tracking mechanism —
  `apps/api/src/stats/stats.repo.ts:3,19,28` (reuses `@post-anki/core`'s `openGaps`),
  `apps/api/src/stats/stats.service.ts:18-22` (sorts weakest-first)
- [x] Strong points list is topics at `mastered` status (existing `deriveTopicStatus` threshold),
  not a new maturity computation — `apps/api/src/stats/stats.service.ts:24-26` (reads the
  server-computed `progress.maturity`/`attempts` already written by `refreshTopicProgress`)
- [x] Page is reachable from the curriculum page (a visible link/button), not a hidden route —
  `apps/web/src/routes/curriculum.$curriculumId.tsx:78-83` (`stats-page-link`)

SCENARIO 2: AI-generated recommendation is on-demand, cached, and gated behind real progress

Once the learner has completed a couple of topics in a curriculum, a "Get recommendations"
action becomes available on the stats page. Triggering it produces short recommendation text
per weak spot, with a real link where the search actually returned one. Recommendations persist
until explicitly regenerated — they are not recomputed on every page view.

What to verify:
- [x] Action is disabled/hidden until at least 2 topics in the curriculum have `attempts > 0`
  (mirrors the user's own words: "especially if I have completed a couple of sections") —
  `apps/api/src/stats/stats.service.ts:16,88,107` (threshold gate),
  `apps/web/src/curriculum/recommendation-panel.tsx:34-41` (`recommendations-gated` UI)
- [x] Generation is explicitly triggered, not automatic on page load — no LLM call fires just from
  visiting the stats page — `getCurriculumStats` (`apps/api/src/stats/stats.service.ts:49-91`)
  never calls `webSearch`; only `generateRecommendations` (line 94) does, wired to the button's
  `onClick` in `apps/web/src/curriculum/recommendation-panel.tsx:52-56`
- [x] Result (text + any citation links) is persisted and reused on next visit; a "regenerate"
  action re-runs it — `apps/api/src/stats/stats.repo.ts:55-71` (`saveRecommendation` deletes +
  re-inserts), `apps/api/src/stats/stats.service.ts:65-66` (cached recs loaded on every stats
  fetch)
- [x] If the underlying search returns no citation, the recommendation still renders (text only,
  no fabricated link) — never a model-invented URL —
  `apps/web/src/curriculum/recommendation-panel.tsx:84-92` (citation link only rendered
  `if (rec.citations.length > 0)`); citations only ever come from `collectCitations`'s real
  `url_citation` annotations (`apps/api/src/probe/probe-grounding.ts`)

SCENARIO 3: Finishing a topic/level recommends the same topic at the next level

A learner masters every topic in a curriculum's Basic module, and that curriculum also has a
Medium module. The next-step suggestion offered is: continue the same curriculum at Medium.

What to verify:
- [x] Recommendation logic detects "all included topics in the current-level module(s) are
  mastered" and a higher-level module exists for the same curriculum —
  `packages/core/src/curriculum/next-step.ts:48-51` (`isModuleFullyMastered` +
  `pickNextLevelTopic`'s rank comparison), test:
  `packages/core/src/curriculum/next-step.test.ts` ("recommends the same curriculum's next-level
  module...")
- [x] Suggestion names the specific next module/topic, not just "go deeper" with no target —
  `packages/core/src/curriculum/next-step.ts:16-23` (`{ kind: "next_level", level, topicId }`)
- [x] If the higher-level module's topics are all `included: false`, the suggestion still points
  at it — `packages/core/src/curriculum/next-step.ts:71-79` (no `included` filter — the deriver
  never sees that field, `LearningMapTopicSnapshot` omits it), test: "still points at the
  next-level module even when its topics are not yet included in the display list"

  Deviation from spec.md's literal deriver signature, noted for review: the plan specified
  `{ kind: "next_level"; curriculumId; moduleId; topicId }`. `LearningMapModuleSnapshot`
  (`packages/shared/src/learning-map.ts`) carries no `moduleId` — only `level`/`progress`/`topics`
  — and the hard rule was to consume `getLearningMapSnapshots()`'s shape as-is, not extend
  `curriculum.repo.ts`'s owned aggregation. Output uses `level` instead of `moduleId`; `topicId`
  alone is sufficient for the frontend to link (topics, not modules, are the app's navigable
  unit — see `apps/web/src/routes/probe.$topicId.tsx`).

SCENARIO 4: With no higher level available, the system recommends a different topic at the same level

A learner masters a curriculum with no Medium/Advanced tier (or already at the top tier). The
next-step suggestion instead points at the weakest not-yet-mastered topic elsewhere, at a
comparable level, rather than dead-ending with no suggestion.

What to verify:
- [x] Falls back to a cross-curriculum weakest-topic pick when no same-curriculum next-level
  exists — `packages/core/src/curriculum/next-step.ts:83-90` (`weakestUnmasteredTopicId`), test:
  "falls back to the weakest not-yet-mastered topic elsewhere..."
- [x] Never returns a topic that's already `mastered` —
  `packages/core/src/curriculum/next-step.ts:86` (`.filter((t) => t.progress.status !== "mastered")`),
  test: "never falls back to a topic that is already mastered"
- [x] Returns `null` (a "no suggestion" state), not an error, if literally everything everywhere
  is mastered — `packages/core/src/curriculum/next-step.ts:30`, test: "returns null when
  literally everything everywhere is mastered"

SCENARIO 5: A streak increments once per day of real study activity

Answering a quiz question or a Socratic turn today, having last been active yesterday,
increments the current streak by one. Answering a second question later the same day does not
increment it again.

What to verify:
- [x] Streak state updates on any graded `answerProbeSession` or `answerSocraticSession` call —
  `apps/api/src/probe-session/probe-session.service.ts:184` (`await recordActivityToday(now);`
  before the return), `apps/api/src/socratic/socratic.service.ts:202` (same, after grading,
  before the graded return — not the blank-answer early-return)
- [x] Same-calendar-day repeat activity is a no-op on the streak count (idempotent) —
  `packages/core/src/streak/streak.ts:19-21`, test: "is a no-op when activity happens again the
  same calendar day"
- [x] `longestStreak` updates when `currentStreak` surpasses it —
  `packages/core/src/streak/streak.ts:28`, test: "raises longestStreak once currentStreak
  surpasses it"

SCENARIO 6: A missed day resets the streak

The learner was active two days ago but not yesterday. Today's activity resets `currentStreak`
to 1 (today counts), while `longestStreak` is preserved from before the break.

What to verify:
- [x] A gap of more than one calendar day resets `currentStreak` to 1, not 0 (today's own
  activity counts) — `packages/core/src/streak/streak.ts:23-24` (`dayGap === 1 ? +1 : 1`), test:
  "resets currentStreak to 1 (today counts) when a full day was missed"
- [x] `longestStreak` is never reduced by a reset — `packages/core/src/streak/streak.ts:28`
  (`Math.max`), test: "never reduces longestStreak on a reset"

SCENARIO 7: Current and longest streak are visibly celebrated

The learner's current streak and their all-time longest streak are shown prominently (e.g. a
banner on the app's main landing page), not buried in a settings screen.

What to verify:
- [x] Streak banner is visible without navigating into a specific curriculum —
  `apps/web/src/routes/dashboard.tsx:17,19,24,45` (loaded and rendered on `/dashboard`)
- [x] A zero/no-streak-yet state renders a neutral, non-punishing message, not an error or blank
  — `apps/web/src/curriculum/streak-banner.tsx:4-11` ("No streak yet — answer a question today
  to start one.")

SCENARIO 8: A curriculum with no attempts yet shows a clean empty state

Opening the stats page for a curriculum the learner hasn't started shows an explanatory empty
state (no weak/strong spots yet, recommendations gated) instead of an empty table or a crash.

What to verify:
- [x] Zero-attempt curriculum renders a clear "nothing to show yet" state on the stats page —
  `apps/web/src/curriculum/weak-strong-list.tsx:12-21` (`stats-empty-state`), manually verified
  live against local dev DB: `GET /curricula/:id/stats` on a fresh curriculum returned
  `{"attemptedTopicCount":0,"weakSpots":[],"strongPoints":[],"recommendationsEligible":false,...}`
- [x] No AI call is triggered for an empty-state curriculum —
  `apps/api/src/stats/stats.service.ts:107-109` (`generateRecommendations` short-circuits before
  any `webSearch` call when under the eligibility threshold); manually verified: `POST
  /curricula/:id/stats/recommendations` on the same fresh curriculum returned
  `{"recommendations":[],"failed":false}` with no OpenRouter call made

## Technical/Architectural Scenarios

SCENARIO 9: Recommendation generation failure degrades gracefully

The recommendation search/LLM call fails (timeout, API error) the same way `probe-grounding.ts`'s
existing web call already handles failure.

What to verify:
- [x] A failed generation attempt shows a clear "couldn't generate, try again" state —
  `apps/web/src/curriculum/recommendation-panel.tsx:65-68` (`recommendations-failed`)
- [x] No stale/partial recommendation row is left in a state that renders as if it succeeded —
  `apps/api/src/stats/stats.service.ts:128-133` (`saveRecommendation` only called when
  `outcome.ok && outcome.text.length > 0`; a failed topic is skipped, not written), same
  ok/status/error discrimination pattern as `probe-grounding.ts`'s `webGround`
  (`apps/api/src/probe/probe-grounding.ts:150-165`)
