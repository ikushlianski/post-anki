---
type: todo
branch: grounded-knowledge-map
task: Mandatory trusted-source grounding + approval gate for course creation, pre-assessment step, cross-cutting tags, and quiz preload/replenish
state: open
updated: 2026-08-09
---
# Todo: Grounded knowledge map

## Decisions to make

- Decide whether a learner's chosen level should still pre-select topics when course creation starts from research.

## To review / clarify

- Later phases generate their own database changes on top of the first phase's, never from scratch.
- Topic tagging must be finished before quiz question refill work begins, not in parallel.
- Update the existing automated test for course creation from a document link; it now fails under the new approval step.

## Manual steps

- Apply the pending database updates to the local development environment before testing this feature.
- No new secrets or configuration are needed for the trusted-source search feature.

## Post-deploy checks

- Check that creating a course by name alone lists real official documentation as sources, not invented links.
- Check that an obscure topic name triggers a warning and requires explicit override, instead of silently generating.
- Check that quizzes for a course created without sources show an ungrounded warning, and normal courses do not.
- Decide whether learners already partway through a course should see the new pre-assessment step once, or be skipped entirely.
- Decide whether the tag-creation capability added during the build should be formally documented in the plan.
- Periodically check for tags with near-duplicate names piling up over time.
- Decide whether small-topic quizzes should top up more questions after just one answer, or only when truly running low.

## Notes

- Historical build record kept in build-log.md.
