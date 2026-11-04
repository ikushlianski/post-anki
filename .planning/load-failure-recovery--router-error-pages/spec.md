# Friendly error and not-found pages

## The ask

Any page whose data fails to load shows a plain message with Retry and a way back to the dashboard, and an unknown address shows a not-found page.

## What to do, files, evidence

The contract is section 5 of `.planning/product-improvement-candidates/report.md` (problem, evidence with file:line, and fix). Follow its Fix paragraph.

## Done when

Tests show the shared error component retries via the router and the not-found component renders for an unknown route; the dashboard loader failure lands on it.
