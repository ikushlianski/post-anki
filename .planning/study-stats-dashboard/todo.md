---
type: todo
branch: study-stats-dashboard
task: Per-curriculum stats page, next-step recommendation, and streaks
state: open
updated: 2026-08-09
---
# Todo: Study stats dashboard

## Decisions to make
Nothing to decide — every open question below was resolved during planning with a logged default, listed here for review only.

- A study streak increases once per day the learner answers any quiz or conversation question, not tied to finishing a full session.
- The stats page is scoped to one course at a time; the study streak is tracked globally across all courses.
- Streak day calculations reuse plain date math already used elsewhere in the app, rather than adding a new date library.
- Recommendations start appearing once a learner has made progress in at least two topics within a course.
- Each topic keeps only its latest recommendation; older recommendations aren't kept as history.

## To review / clarify
- The next-step recommendation feature depends on a related, still-unbuilt learning-map feature; that needs to land first before this piece can work.
- Several other in-progress plans touch the same quiz and conversation logic for small additions; worth a human check that they all merge cleanly together.
- Topic reading recommendations reuse the same web-search step used for quiz sourcing, but for an unrelated purpose — not overlapping work with a sibling plan.

## Manual steps
No manual steps needed beyond the standard database update step already used for this project; no new credentials or configuration required.

## Post-deploy checks
- Apply the new database update before testing, or the stats and streaks pages will fail to load.
- Answer one quiz question and confirm the streak count shows one; answer another the same day and confirm it stays at one.
