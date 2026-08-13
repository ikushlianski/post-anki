---
type: todo
branch: To-Learn-List
task: analytics and reporting
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Calculate how long it takes learners to master each gap
- [ ] 2. Calculate how well learners retain material after mastering it
- [ ] 3. Build a report showing how much of each subject area is covered
- [ ] 4. Assemble a weekly summary of learning progress
- [ ] 5. Pull together the underlying progress data needed for reports
- [ ] 6. Combine progress data with existing concern and streak summaries
- [ ] 7. Expose coverage, retention and digest reports through the API
- [ ] 8. Build a dashboard with a coverage heat map and weekly digest panel

## Manual steps

- [ ] Human review: confirm the plan is approved
- [ ] Review every decision made automatically during planning, especially skipping week-over-week trends
- [ ] Decide later whether tracking trends over time is worth adding, once current reports are in use

## Notes

- This module should not need any new data storage; if one seems genuinely needed, that's a decision to flag, not decide alone.
- Retention and time-to-mastery both use mastery records, not the unrelated language-practice data.
- Coverage reporting only covers Web Development's fixed subject areas for now, matching how a related feature scoped itself; other subjects get nothing here until they have similar structure.
- The digest is pull-only; never push it through notifications without a fresh explicit decision, matching how related features have handled the same question.
