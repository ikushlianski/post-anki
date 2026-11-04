# Learner-set daily new-card limit

## The ask

The learner sets the daily new-card limit in settings (default 20, 1 to 200), the review queue and counts use it, and the done screen says when the limit ended the session.

## What to do, files, evidence

The contract is section 8 of `.planning/product-improvement-candidates/report.md` (problem, evidence with file:line, and fix). Follow its Fix paragraph.

## Done when

Tests show the queue and counts use the stored setting, values are clamped, the migration is generated through the project's migrate flow, and the done screen shows the limit message.
