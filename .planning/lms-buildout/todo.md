---
type: todo
branch: To-Learn-List
task: turn post-anki into a full learning management system
state: open
updated: 2026-08-09
---

# LMS buildout

Guiding star for the unattended run. Details for each module live in their own planning notes.

## Coding tasks

### Module 0 — Learning-list hardening

- [x] 0.1 Offer to extend an existing curriculum instead of starting a duplicate one
- [x] 0.2 Keep dropped topics from reappearing by telling "not yet released" apart from "excluded"
- [x] 0.3 Pace topic release so a learner cannot reach the ceiling in one sitting
- [x] 0.4a Track and expose when a learner chose to go deeper on a topic
- [x] 0.4b Remove the old workaround for tracking whether depth had been chosen
- [x] 0.5 Remember when a learner declines extra topics so the cooldown survives a reload
- [x] 0.6 Make approval trust levels consistent across sub-subjects and areas
- [x] 0.7 Let related topics cross-link between subjects, starting with AWS and cloud computing
- [x] 0.8 Fix ordering conflicts among the three new sub-subjects
- [x] 0.9 Generate a batch's topics and questions automatically instead of only using pre-written ones
- [x] 0.10 Release the first batch of topics automatically once a mini-course is approved

### Module 1 — Learning paths

- [x] 1.1 Define an ordered learning path through curricula and areas toward a target role
- [x] 1.2 Resolve prerequisites using existing subject relationships
- [x] 1.3 Track progress along a path and suggest the next step
- [x] 1.4 Let learners browse, start and track a learning path

### Module 2 — Notes and highlights (learning brain)

- [x] 2.1 Let learners capture a note or highlight against a topic, gap or source
- [x] 2.2 Let learners search all their notes and filter by subject
- [x] 2.3 Resurface a learner's own notes as study material
- [x] 2.4 Let learners capture notes while studying and browse them afterward

### Module 3 — Study scheduling

- [x] 3.1 Let learners plan study sessions with a goal and a length
- [x] 3.2 Fill a study session with work drawn from paths, gaps and reminders
- [x] 3.3 Track study consistency beyond the simple streak count
- [x] 3.4 Let learners schedule, run and review a study session

### Module 4 — Analytics and reporting

- [x] 4.1 Measure retention and how long mastery takes, based on past attempts
- [x] 4.2 Report mastery coverage per subject area against the full curriculum
- [x] 4.3 Assemble a weekly summary from these reports
- [x] 4.4 Show an analytics dashboard with a coverage heat map

### Module 5 — Content library

- [x] 5.1 List sources across curricula with their origin and fetch status
- [x] 5.2 Detect duplicate sources and allow re-fetching them
- [x] 5.3 Let learners browse the library and see what they have read

### Module 6 — Milestones and completion

- [x] 6.1 Define what counts as complete for each curriculum and area
- [x] 6.2 Award milestones automatically once completion criteria are met
- [x] 6.3 Show earned milestones to the learner

### Module 7 — AI study-material generation

- [x] 7.1 Generate topic explanations grounded in and citing real sources
- [x] 7.2 Generate worked examples and analogies on request
- [x] 7.3 Let learners request and read generated material while studying

## Manual steps

- [ ] Allow the test environment to fetch sources from approved locations
- [ ] Load the initial subject taxonomy into production once, after migration
- [ ] Have a human confirm the learning-list plan is approved
- [ ] Review every decision the system made on its own, per module

## Notes

- Never commit, push, or run a database migration against real data; generate only.
- Work is split across multiple lightweight helper sessions coordinated by this one.
- For each module: plan it, build it in stages, add mock data, then check it visually in the app.
