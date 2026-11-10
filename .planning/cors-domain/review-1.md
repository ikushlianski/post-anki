## CORS custom domain review

**Verdict: PASS**

### Checks performed

- `WEB_ORIGINS` parsing: confirmed in `api-server.ts` lines 348-350 — split on `,`, trimmed, empty strings filtered, passed as `extraOrigins` to `resolveCorsDecision`.
- `extraOrigins` appended to allow-list: confirmed in `cors.ts` lines 29-31.
- `Vary: Origin` on 403: confirmed — `res.setHeader("Vary", "Origin")` at line 359 runs before the forbidden-check at line 361, so the header is sent on 403 responses.
- 13 CORS tests: `npx vitest run` — 2 test files, 13/13 passed.
- `npx tsc --noEmit` — zero errors in `cors.ts` and `api-server.ts`.

### Findings

None.

END-OF-REPORT
