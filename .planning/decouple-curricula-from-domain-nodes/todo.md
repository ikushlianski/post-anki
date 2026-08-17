---
type: todo
branch: decouple-curricula-from-domain-nodes
task: "Decouple curricula from domain node creation — map into static taxonomy instead (issue #84)"
state: open
updated: 2026-08-09
---
# Todo: Decouple curricula from domain node creation

## Decisions to make
- All six decisions below are queued for Ilya to confirm before work proceeds on the recommendations.
  1. Domain nodes: stay organized per subject, or become one shared tree across all subjects? (recommended: per subject)
  2. Which subject should hold the new IT taxonomy — an existing one, or a brand new one? (recommended: new subject)
  3. Does automatic taxonomy matching run on request, or immediately when a course is created? (recommended: on request)
  4. How should old, automatically-created topics be reconciled with the new fixed taxonomy? (recommended: reviewable merge suggestions, as a later ticket)
  5. Do subjects without a fixed taxonomy keep growing their topic map automatically? (recommended: yes, unchanged)
  6. Should the old direct course-to-topic link be removed once the new link table exists? (recommended: yes, removed)

## To review / clarify
- [ ] Confirm which subjects have real topic data today, to size the reconciliation work later.
- [ ] Once the taxonomy subject is chosen, seed the taxonomy into production by hand.

## Manual steps
- Seed the new taxonomy into production by hand, once, after the subject decision is made.
- Ilya clears the decision-needed label once all six decisions are answered; this plan does not do it.

## Post-deploy checks
- [ ] After deploy, confirm one real course gets a valid, real taxonomy suggestion, not an invented one.
- [ ] Confirm courses outside the taxonomy subject still get an automatically created topic, same as before.

## Coding tasks
- [x] Add logic to validate AI-suggested taxonomy matches, with tests.
- [x] Add logic to tell whether a topic came from the fixed taxonomy or was auto-created, with tests.
- [x] Fix progress counts so a topic with a shared parent isn't counted twice, with a regression test.
- [x] Add storage for course-to-taxonomy links and track where each topic originated.
- [x] Add data access for course-to-taxonomy mapping records.
- [x] Add an AI agent that suggests taxonomy matches for a course.
- [x] Add the workflow that runs the taxonomy-matching suggestion end to end.
- [x] Expose the taxonomy-matching suggestion feature through the API.
- [x] Update course handling to prefer explicit placements and derive topic links from mapping records.
- [x] Rework how a subject's topic map is read and how topics get merged.
- [x] Keep the dashboard board view in sync with the updated topic-link data.
- [x] Migrate the database to the new mapping table and remove the old direct link, verified against real data.
- [x] Update affected tests for the new mapping structure; all pass except one unrelated pre-existing failure.
- [x] Add a test proving a course mapped to both sides of a merge ends up mapped once, not twice.
- [x] Test the taxonomy-suggestion workflow, including rejecting an invented topic match.
- [x] Add a script to seed the fixed taxonomy into a chosen subject.
- [x] Add a course page panel for reviewing and confirming suggested taxonomy matches.
- [x] Write up the architecture of this change.
- [x] Run the full automated test suite and type checks; all pass except one unrelated failure.
- [x] Manually verify the suggestion-and-approval flow end to end against a live server.

## Follow-on candidates (not this ticket)
- Adopt one standard place for architecture documentation across the repo, as a deliberate separate effort.
- Reconcile old automatically-created topics with the new taxonomy, once the subject decision is made.
- Add a subject-wide view for reviewing all pending taxonomy matches, if reviewing one by one proves too slow.

## Notes
- Historical build record kept in build-log.md.
