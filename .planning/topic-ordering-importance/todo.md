---
type: todo
branch: topic-ordering-importance
task: Promote/demote modules and topics, per-node comments, and AI-decided strict document order
state: open
updated: 2026-08-09
---
# Todo: Topic ordering & importance

## Decisions to make
Nothing to decide — every open question during planning already has a logged default, listed here for review only.

## To review / clarify
- A separate, not-yet-built recommendation feature should treat topic and section importance as a signal once it exists; this plan only adds the setting itself.
- Strict step-by-step ordering is set for a whole course, not per section — judged sufficient for personal use, but flag if that turns out too coarse.
- Some assumptions about where module and topic update logic lived were corrected after checking the actual code structure during review.

## Manual steps
No manual steps needed beyond the standard database update step already used for this project.

## Post-deploy checks
- Study a technology known for step-by-step docs and confirm the system actually marks it as strict order, not just accepting the setting structurally.
- Confirm a note explaining why reordering isn't visible actually appears for strict-order courses when a topic is promoted or demoted with no visible change.
