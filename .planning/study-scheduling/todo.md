---
type: todo
branch: To-Learn-List
task: study scheduling
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [ ] 1. Store planned study sessions with their target, duration and progress
- [ ] 2. Calculate session content, timing, recorded answers, missed status and consistency
- [ ] 3. Save, update and count study sessions
- [ ] 4. Resolve what a session should cover, reusing existing content-selection logic unchanged
- [ ] 5. Let learners create, start, end and review sessions through the API
- [ ] 6. Let learners plan and view their scheduled sessions
- [ ] 7. Build the screens for running and reviewing sessions and tracking consistency

## Manual steps

- [ ] Get human review and sign-off on the plan
- [ ] Review every decision made automatically during planning, especially the choice not to send
      reminders
- [ ] Once learning paths ship, confirm sessions can actually target a full path

## Notes

- Scheduling must never build its own separate logic for picking what to study — it always
  reuses the existing content-ranking system. Any proposal to add session-specific ranking is a
  decision for a person, not a default to take.
- Scheduled sessions must never trigger reminders or notifications of any kind.
- Consistency tracking only covers whether planned sessions were completed. Broader analytics
  like retention or mastery over time belong to a future module.
- Marking a session as missed is only ever a label shown to the learner — it must never be
  stored as a real status or trigger a notification.
