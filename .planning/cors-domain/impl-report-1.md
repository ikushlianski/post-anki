## CORS custom domain allow-list — implementation report

### What was done

`WEB_ORIGINS` already existed as an optional comma-separated string in `env.ts` and was already referenced in `api-server.cors.test.ts`. The variable was not yet wired into the CORS logic.

**`apps/api/src/shared/cors.ts`** — added `extraOrigins?: string[]` to `CorsInput`; when present, entries are appended to the allow-list before the origin check.

**`apps/api/src/api-server.ts`** — parses `env.WEB_ORIGINS` (split on `,`, trimmed, empty strings filtered) into `extraOrigins` and passes it to `resolveCorsDecision`. Also moved `res.setHeader("Vary", "Origin")` above the forbidden-check so the header is sent on 403 responses too (required by the existing tests in `api-server.cors.test.ts`).

**`apps/api/.env.example`** — added a commented-out `WEB_ORIGINS` example line next to `EXTENSION_ID`.

### Variables changed

| Var | env.ts change | Behaviour |
|-----|--------------|-----------|
| `WEB_ORIGINS` | pre-existing (no change needed) | optional; comma-separated extra origins added to CORS allow-list |

### Checks

- `npx tsc --noEmit` — zero errors in changed files; pre-existing errors are in unrelated dirty files on this branch.
- `npx vitest run apps/api/src/shared/cors.test.ts apps/api/src/api-server.cors.test.ts` — 13/13 passed.
- Full `npx vitest run` — 161 test files fail due to pre-existing dirty files; all CORS tests green.

### Default taken

Used the already-declared `WEB_ORIGINS` variable (the "(or similarly named)" clause in the brief) instead of adding a separate `CUSTOM_DOMAIN`, avoiding a redundant env var.

END-OF-REPORT
