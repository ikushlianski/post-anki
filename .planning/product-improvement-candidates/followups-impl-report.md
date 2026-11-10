# Follow-ups impl report

## 1. Sidebar count reply ordering
- Files: apps/web/src/nav/sidebar.tsx, apps/web/src/nav/sidebar.test.tsx
- Behavior: `useReviewCounts` bumps a request counter ref per load and applies a response only if it is still the latest; failed refresh keeps last counts and the unmount guard is unchanged.
- Test: "should show the newest counts when an older reply arrives last during fast grading" (first fetch resolves after the second; label stays the second's counts).
- Citation: apps/web/src/nav/sidebar.tsx:60 (counter bump) and :69 (latest-only apply).

## 2. Cancelled card download
- Files: apps/api/src/knowledge-bit/knowledge-bit-export.controller.ts, apps/api/src/knowledge-bit/knowledge-bit-export.controller.test.ts, apps/web/src/routes/api.knowledge-bits.export.ts
- Behavior: `write` races `drain` against `close`/`error` (listeners removed on settle) and returns false when the client is gone; the handler returns, which closes the generator. The web route passes `request.signal` to the upstream fetch and returns a plain-text 502 if the fetch throws, rethrowing when the request was aborted.
- Test: "should stop reading cards and finish when the client disconnects mid-download" (generator finally runs, handler resolves).
- Citation: apps/api/src/knowledge-bit/knowledge-bit-export.controller.ts:7-28 (race), apps/web/src/routes/api.knowledge-bits.export.ts:23 (signal).

## 3. Negative numbers in CSV
- Files: apps/api/src/knowledge-bit/knowledge-bit-export.csv.ts, apps/api/src/knowledge-bit/knowledge-bit-export.csv.test.ts
- Behavior: formula guard applies only to string values; `-2` stays `-2`, string "-2" becomes `'-2`.
- Citation: apps/api/src/knowledge-bit/knowledge-bit-export.csv.ts:27.

## Verification
- `cd apps/web && npx vitest run src/nav`: 8 passed, 0 failed.
- `cd apps/api && npx vitest run src/knowledge-bit/knowledge-bit-export`: 14 passed, 0 failed.
- `npx tsc --noEmit`: clean in apps/web and apps/api.

## Defaults and undone
- Disconnect is detected via `close`/`error` plus an up-front `destroyed` check; stream.pipeline was not used.
- Nothing undone. No excluded files touched; nothing staged or committed.

END-OF-REPORT
