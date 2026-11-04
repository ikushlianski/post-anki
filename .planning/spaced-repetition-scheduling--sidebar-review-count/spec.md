# Sidebar review count stays current

## The ask

The sidebar's due and new counts match the review screen and update after the learner grades, undoes, buries, suspends or approves.

## What to do, files, evidence

The contract is section 1 of `.planning/product-improvement-candidates/report.md` (problem, evidence with file:line, and fix). Follow its Fix paragraph.

## Done when

Component tests show the sidebar passes the browser time zone, reloads on the change event, and keeps the last counts when a refresh fails.
