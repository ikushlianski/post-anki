# Typed answer survives failures

## The ask

On the typed-answer screen, a load failure shows an error with Retry, and a grading failure keeps the typed answer with a Try again action.

## What to do, files, evidence

The contract is section 7 of `.planning/product-improvement-candidates/report.md` (problem, evidence with file:line, and fix). Follow its Fix paragraph.

## Done when

Component tests show the load error state, the plain grading-failure sentence, Try again keeping the draft, and Skip clearing it.
