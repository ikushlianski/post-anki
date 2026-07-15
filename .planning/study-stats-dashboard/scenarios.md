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
- Weak spots list is built from open gaps ranked by depth/importance, reusing existing
  `openGaps`/gap state, not a new tracking mechanism
- Strong points list is topics at `mastered` status (existing `deriveTopicStatus` threshold),
  not a new maturity computation
- Page is reachable from the curriculum page (a visible link/button), not a hidden route

SCENARIO 2: AI-generated recommendation is on-demand, cached, and gated behind real progress

Once the learner has completed a couple of topics in a curriculum, a "Get recommendations"
action becomes available on the stats page. Triggering it produces short recommendation text
per weak spot, with a real link where the search actually returned one. Recommendations persist
until explicitly regenerated — they are not recomputed on every page view.

What to verify:
- Action is disabled/hidden until at least 2 topics in the curriculum have `attempts > 0`
  (mirrors the user's own words: "especially if I have completed a couple of sections")
- Generation is explicitly triggered, not automatic on page load — no LLM call fires just from
  visiting the stats page
- Result (text + any citation links) is persisted and reused on next visit; a "regenerate"
  action re-runs it
- If the underlying search returns no citation, the recommendation still renders (text only,
  no fabricated link) — never a model-invented URL

SCENARIO 3: Finishing a topic/level recommends the same topic at the next level

A learner masters every topic in a curriculum's Basic module, and that curriculum also has a
Medium module. The next-step suggestion offered is: continue the same curriculum at Medium.

What to verify:
- Recommendation logic detects "all included topics in the current-level module(s) are
  mastered" and a higher-level module exists for the same curriculum
- Suggestion names the specific next module/topic, not just "go deeper" with no target
- If the higher-level module's topics are all `included: false`, the suggestion still points at
  it (surfacing it is itself the nudge to include it) rather than skipping past it silently

SCENARIO 4: With no higher level available, the system recommends a different topic at the same level

A learner masters a curriculum with no Medium/Advanced tier (or already at the top tier). The
next-step suggestion instead points at the weakest not-yet-mastered topic elsewhere, at a
comparable level, rather than dead-ending with no suggestion.

What to verify:
- Falls back to a cross-curriculum weakest-topic pick when no same-curriculum next-level exists
- Never returns a topic that's already `mastered`
- Returns `null` (a "no suggestion" state), not an error, if literally everything everywhere is
  mastered

SCENARIO 5: A streak increments once per day of real study activity

Answering a quiz question or a Socratic turn today, having last been active yesterday,
increments the current streak by one. Answering a second question later the same day does not
increment it again.

What to verify:
- Streak state updates on any graded `answerProbeSession` or `answerSocraticSession` call
- Same-calendar-day repeat activity is a no-op on the streak count (idempotent)
- `longestStreak` updates when `currentStreak` surpasses it

SCENARIO 6: A missed day resets the streak

The learner was active two days ago but not yesterday. Today's activity resets `currentStreak`
to 1 (today counts), while `longestStreak` is preserved from before the break.

What to verify:
- A gap of more than one calendar day resets `currentStreak` to 1, not 0 (today's own activity
  counts)
- `longestStreak` is never reduced by a reset

SCENARIO 7: Current and longest streak are visibly celebrated

The learner's current streak and their all-time longest streak are shown prominently (e.g. a
banner on the app's main landing page), not buried in a settings screen.

What to verify:
- Streak banner is visible without navigating into a specific curriculum
- A zero/no-streak-yet state renders a neutral, non-punishing message, not an error or blank

SCENARIO 8: A curriculum with no attempts yet shows a clean empty state

Opening the stats page for a curriculum the learner hasn't started shows an explanatory empty
state (no weak/strong spots yet, recommendations gated) instead of an empty table or a crash.

What to verify:
- Zero-attempt curriculum renders a clear "nothing to show yet" state on the stats page
- No AI call is triggered for an empty-state curriculum

## Technical/Architectural Scenarios

SCENARIO 9: Recommendation generation failure degrades gracefully

The recommendation search/LLM call fails (timeout, API error) the same way `probe-grounding.ts`'s
existing web call already handles failure.

What to verify:
- A failed generation attempt shows a clear "couldn't generate, try again" state
- No stale/partial recommendation row is left in a state that renders as if it succeeded
