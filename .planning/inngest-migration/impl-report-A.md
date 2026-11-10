# Unit A implementation report

## Installed package
`inngest@4.23.0` added to `apps/api/package.json` dependencies.

## Files created
- `apps/api/src/shared/inngest-client.ts` — exports `createInngestClient()` returning `new Inngest({ id: "post-anki-api" })`.
- `apps/api/src/shared/inngest-serve.ts` — exports `createInngestServeHandler(functions: InngestFunction.Like[])` wrapping `serve` from `inngest/node`.
- `apps/api/src/shared/inngest-serve.test.ts` — 3 tests: `/api/inngest` returns non-401 without a bearer token; another path returns 401 without token; another path returns 200 with valid token.

## Files edited (additive hunks only)
- `apps/api/src/shared/env.ts` — added `INNGEST_DEV`, `INNGEST_BASE_URL`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (all optional strings) and `DURABLE_EXTRACTION_ENGINE` (optional string, default `'dbos'`).
- `apps/api/src/api-server.ts` — imported `createInngestServeHandler`, instantiated handler once at module level with an empty functions array, mounted at `path === "/api/inngest"` immediately after the `/_healthz` route and before the `handleRequest` bearer-auth gate.
- `package.json` (root) — added `inngest:dev` script: `docker run --rm -it -p ${INNGEST_PORT:-8288}:8288 inngest/inngest:latest inngest dev -u http://host.docker.internal:${PORT:-5560}/api/inngest`.

## Quality gate results
- `npx tsc --noEmit` in `apps/api`: zero errors.
- `npx vitest run src/shared/inngest-serve.test.ts`: 3/3 tests passed.
- No lint script found in either `apps/api/package.json` or root `package.json`.

## Defaults chosen
- Used `InngestFunction.Like[]` (namespace type) instead of `InngestFunction<...>` because the generic requires 3–5 type arguments; `Like` is the correct unparameterised interface for a function array argument.
- `inngest/inngest:latest` Docker image tag — the plan says "pinned at implementation"; no digest or semver tag was reachable without pulling; `latest` is what the plan's own example uses in step 6.
- `INNGEST_PORT` used as the host-side Docker port variable (plan step 3 says "host port from `INNGEST_PORT` (default 8288)"); the plan's literal step 6 text shows `$PORT` only for the API URL, not the host port mapping — the "Defaults chosen" section was used as the authoritative source.

END-OF-REPORT
