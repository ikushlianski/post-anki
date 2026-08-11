---
type: todo
branch: question-feedback-memory
task: Per-question/turn thumbs feedback that feeds future quiz and Socratic generation
state: open
updated: 2026-08-09
---
# Todo: Question feedback memory

## Decisions to make
Nothing to decide — every open question during planning already has a logged default, listed below only for review.

## To review / clarify
- Feedback buttons on quiz and chat screens depend on a related feature's screens already existing; build backend work first, wire the buttons in after.
- A future stats dashboard could show feedback trends, but this plan only stores and uses feedback — it doesn't report on it.
- If feedback volume grows much larger over time, the current fixed limit on stored feedback per topic may need revisiting.

## Manual steps
No manual steps needed beyond the standard database update step already used for this project.

## Post-deploy checks
- After deploying, confirm a thumbs-down with a comment actually changes the next generated quiz for that same topic.
