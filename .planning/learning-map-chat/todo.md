---
type: todo
branch: learning-map-chat
task: Persistent sidebar study chat with cross-curriculum learning-map context + level-aware generation
state: open
updated: 2026-08-09
---
# Todo: Learning-map sidebar chat

## Decisions to make
Nothing to decide — every fork below was resolved autonomously during this unattended planning
run, with a logged default. Listed here for morning review only.

- A wrong answer never moves an already-mastered topic back to needing review; flag if that behavior is actually wanted.
- Whether the sidebar chat shares its look with the existing study chat is decided during building, not now.
- Chat history is not saved between visits; closing the tab clears the conversation, matching the other chat surface.
- The learner's course summary shown to the assistant is capped in size, prioritising courses currently in progress.
- The learner's skill level is passed to the assistant as a plain hint, not as a separate structured field.

## To review / clarify
- Another planned feature (the stats dashboard) depends on this one's course-progress data; build this one first.
- Streak and celebration banners belong to a different feature; this one only covers chat and content generation.

## Manual steps
No manual steps required; the chat feature reuses the existing AI provider setup already used elsewhere.

## Post-deploy checks
- Confirm the chat still answers sensibly for a learner who has studied only one course.
- Confirm quiz and chat generation is unchanged for courses that have no skill-level tiers set.
