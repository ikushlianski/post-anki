---
type: todo
branch: To-Learn-List
task: milestones and completion
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Determine when a topic, gap or area counts as fully mastered
- [ ] 2. Store one milestone record per achievement per learner
- [ ] 3. Award a milestone once and list all milestones earned
- [ ] 4. Expose earned milestones through the API, checked whenever viewed
- [ ] 5. Build a celebratory milestones gallery, with no progress percentages or overdue warnings

## Manual steps

- [ ] Human review: confirm the plan is approved
- [ ] Review every decision made automatically during planning, especially never revoking milestones and sending no notifications
- [ ] Decide on future milestone types later, once full mastery has been lived with for a while

## Notes

- Milestones must never be revoked or deleted once earned; adding any cleanup or re-validation later needs a fresh explicit decision.
- This depends on the coverage reporting feature for area completion percentages, but can compute area completion on its own if that feature isn't ready yet.
- Checking for new milestones only happens when milestones are viewed, not on every other page, to avoid unnecessary writes.
