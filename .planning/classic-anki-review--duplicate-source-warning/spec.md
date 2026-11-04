# Warn before adding a source twice

## The ask

Adding a link or text already added is refused with a link to the earlier source, unless the learner explicitly chooses to add it again.

## What to do, files, evidence

The contract is section 3 of `.planning/product-improvement-candidates/report.md` (problem, evidence with file:line, and fix). Follow its Fix paragraph.

## Done when

API tests show a repeat URL or identical text returns 409 already_added with the existing id, and force adds it; web tests show the warning and the add-again action. The extension shows the already-added state.
