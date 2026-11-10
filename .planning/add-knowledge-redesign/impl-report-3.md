# Implementation report 3

Diff command: `git diff -- apps/web/src/knowledge-source/add-knowledge-form.tsx apps/web/src/routes/-add-knowledge.test.tsx` (nothing staged or committed).

## Checks
- apps/web `npx tsc --noEmit`: clean
- apps/web `npx vitest run`: all passed

## Changes
- Subject and Model now share one top row (`grid gap-3 sm:grid-cols-2`, stacked on phones), above the paste box. The model hint stays directly under the model select.
- "Adding to:" and More options stay under that row, above the paste box. Testids and behavior unchanged.
- Existing tests did not depend on the old order; added one test for the new row layout.

END-OF-REPORT
