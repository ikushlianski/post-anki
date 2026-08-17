---
type: todo
branch: To-Learn-List
task: learning paths
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Bring back tracking of taxonomy ids and their prerequisites when parsing the taxonomy.
- [ ] 2. Set up storage for topic prerequisites and learning paths with their steps.
- [ ] 3. Extend the taxonomy seed to also set up prerequisite links, safely re-runnable.
- [ ] 4. Add logic to order a learning path's steps, track progress, and find the next step.
- [ ] 5. Define role-based learning path templates and resolve them against the taxonomy.
- [ ] 6. Build the storage, creation workflow, and API for learning paths.
- [ ] 7. Expose browsing templates, creating, viewing, and abandoning learning paths through the API.
- [ ] 8. Surface what to study next through the existing nudge system, based on the current path step.
- [ ] 9. Build web pages to browse templates, create and view paths with progress, and abandon a path.

## Manual steps

- [ ] Human review: confirm the plan is finalized.
- [ ] Review every decision made without human input, especially reversing the earlier call to skip storing prerequisites.
- [ ] Decide which role templates to launch with, beyond the three already drafted, once more topic areas exist.

## Notes

- Storing prerequisites is a new kind of relationship for this system; model it as a flexible many-to-many link, not a single-parent structure.
- Taxonomy topics can depend on topics in different branches, so all topics must load before prerequisite links resolve, or links get missed.
- The web development areas have no prerequisites yet, so role templates fall back to taxonomy order — expected, not a bug.
- A separate open question about linking AWS to Cloud Computing isn't resolved by this work; ordering prerequisites answers a narrower need.
- Learning path steps deliberately store no progress or timestamps; adding that later is a new decision, not an oversight to fix.
