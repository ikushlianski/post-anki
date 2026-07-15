---
type: todo
branch: question-feedback-memory
task: Per-question/turn thumbs feedback that feeds future quiz and Socratic generation
state: open
updated: 2026-07-15
---
# Todo: Question feedback memory

## Decisions to make
Nothing to decide — every fork encountered during planning was resolved autonomously with a
logged default (`spec.md`'s "Decisions made autonomously", 12 items). Listed below purely for
morning sanity-check, not because anything is blocked.

## To review / clarify
- Sequencing dependency, not a blocker: this plan's frontend wiring (`ItemFeedbackButtons` inside
  `probe-session-quiz.tsx`/`socratic-chat.tsx`) assumes `topic-study-experience`'s
  `ProbeSessionQuiz`/`SocraticChat` components already exist. That sibling plan was mid-implementation
  in parallel at the time this was planned — implement-ie for this plan should run its backend
  phases (1–3) freely, but hold Phase 4 (frontend wiring) until the sibling components have landed,
  or treat the two integration points as a small follow-up diff.
- Cross-plan dependency for future work, not built here: the personal-learning-map chat + stats
  dashboard (a separate parallel plan, out of this plan's scope) would be a natural home for
  surfacing feedback trends (e.g. "you've disliked coding-challenge-style questions 4 times") —
  this plan only stores and injects feedback, it builds no aggregate/reporting view.
- If feedback volume ever grows well beyond a personal-app scale, the flat recency-cap retrieval
  (10 down + 5 up per topic) would need revisiting — not a concern at today's scale, flagged only
  so it isn't silently assumed to scale indefinitely.

## Manual steps
No manual steps required — no new env vars, no new secrets, no infra outside the generated
migration (applied via the existing `npm run db:migrate` step already used in this repo).

## Post-deploy checks
- After deploying, confirm one real thumbs-down-with-comment round-trips into a regenerated quiz
  batch's prompt for the same topic — this is the one behavior typecheck/unit tests can't verify
  (LLM prompt content isn't asserted in tests, only the deriver's string output is).
