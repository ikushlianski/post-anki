---
type: todo
branch: study-stats-dashboard
task: Per-curriculum stats page, next-step recommendation, and streaks
state: open
updated: 2026-07-15
---
# Todo: Study stats dashboard

## Decisions to make
Nothing to decide — every fork below was resolved autonomously during this unattended planning
run (no `AskUserQuestion`), with a logged default. Listed here for morning review only.

- **Streak-increment trigger: any graded `answerProbeSession` or `answerSocraticSession` call**,
  once per calendar day. Not tied to "completed a full session" or "answered N questions" — the
  simplest definition that matches "hailed for being on a streak" without inventing a session-
  completion threshold the user never specified.
- **Stats page is per-curriculum (`/curriculum/$curriculumId/stats`), streak is global
  (`/dashboard`).** Read from the user's own phrasing ("if I have started to study the
  statistics module and I see a statistics page for my studies") — weak/strong/recommendations
  are inherently curriculum-scoped; a streak is not.
- **No new date library added for streak day-diff math** — follows the exact raw-`Date`
  arithmetic pattern `daily-push.ts`'s `isStale` already uses in this codebase; a full date
  library is unjustified overhead for one calendar-day comparison.
- **Recommendation gate: 2+ topics with `attempts > 0` in the curriculum**, not a percentage
  threshold — matches "especially if I have completed a couple of sections" literally rather
  than inventing a maturity-percent cutoff.
- **`topic_recommendations` is overwrite-on-regenerate, not versioned/history-kept** — only the
  latest recommendation per topic is ever shown; matches the existing `probe-session` regenerate
  pattern (delete + recreate) rather than adding history UI nobody asked for.

## To review / clarify
- **Hard cross-plan dependency on `learning-map-chat`:** `nextStepRecommendation`
  (`packages/core/src/curriculum/next-step.ts`) takes `LearningMapSnapshot[]` as its input type
  and is called with the output of `learning-map-chat`'s `getLearningMapSnapshots()`
  (`apps/api/src/curriculum/curriculum.repo.ts`). This plan's next-step piece cannot be
  implemented or typechecked until that function and type exist. Implement `learning-map-chat`
  first, or at minimum land its repo function + `LearningMapSnapshot` type before starting this
  plan's SCENARIO 3/4 work.
- **This plan touches `probe-session.service.ts` and `socratic.service.ts` for the one-line
  streak-recording call** — both files are also touched by the parallel "quiz generation
  fidelity" and "feedback/promote-demote" plans in adjacent ways (per the moonshine run log).
  Worth a human glance at merge time to make sure these small additive touches from three
  different plans land cleanly rather than silently overwriting each other.
- **Recommendation generation reuses `probe-grounding.ts`'s web-search mechanism for a new
  purpose** (topic-level reading recommendations, not quiz grounding). Flagging only so this
  isn't mistaken for scope creep into the sibling "quiz fidelity" plan's citation work — it's a
  parallel, independent use of the same already-proven search call, not a shared feature.

## Manual steps
No manual steps required beyond the standard migration-apply step already named in
`architecture.md`'s Rollout section — no new env vars or secrets (reuses the existing
`OPENROUTER_API_KEY`).

## Post-deploy checks
- Apply the generated migration for `topic_recommendations` and `user_streaks` before testing —
  first read of either table before migration will 500, easy to misdiagnose as a logic bug.
- Answer one quiz question, confirm `user_streaks` shows `current_streak: 1`; answer a second
  the same day and confirm it's still 1 (SCENARIO 5's idempotency check can't be fully verified
  by a unit test alone since it depends on real wall-clock dates across days).
