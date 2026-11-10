# Vary Origin on rejected cross-origin responses

Task: add `Vary: Origin` to the 403 the API sends for a disallowed origin, without adding any `Access-Control-Allow-*` header and without changing which origins are allowed.

## Change

- `apps/api/src/api-server.ts` (`createApiServer`, origin check): `res.setHeader("Vary", "Origin")` now runs before the `forbidden` check instead of after it. There is exactly one rejection path (`sendError(res, 403, "origin_not_allowed")`), so it now carries `Vary: Origin`. The allow-list, the status codes and the Access-Control headers on allowed responses are unchanged.
- `docs/architecture/extension/highlight-capture.md`: the origin section now says `Vary: Origin` is set on every response of the origin check, including the 403, which carries no `Access-Control-Allow-*` header.

## Tests (new file, 6 tests)

`apps/api/src/api-server.cors.test.ts` runs the real server on a random port with `WEB_ORIGIN=https://app.example.com` and `WEB_ORIGINS=https://extra.example.com`:

- disallowed origin: 403, `Vary` contains Origin, no `Access-Control-Allow-Origin`, `-Credentials` or `-Methods`;
- preflight (OPTIONS) from a disallowed origin: 403, `Vary: Origin`, no allow header;
- configured web origin: 200, echoed exactly, `Vary: Origin`;
- extra configured origin: 200 and echoed;
- no Origin header: 200, `Access-Control-Allow-Origin` is the web origin, `Vary: Origin`;
- preflight from the allowed origin: 204 with the allowed methods.

Mutation check: with the `Vary` line moved back after the rejection, 2 tests fail (the two disallowed-origin ones); restored, all 6 pass.

## Verification (real output)

- `npx tsc --noEmit` in apps/api: exit 0. In packages/shared: exit 0.
- `npx vitest run src/api-server.cors.test.ts`: Tests 6 passed (6).
- `npx vitest run` in apps/api: Test Files 165 passed (165), Tests 1558 passed (1558).

## Left open

- Nothing in this item. Deploy-time behavior of the comma-separated `WEB_ORIGINS` variable is unchanged and was noted in the earlier origins review.

END-OF-REPORT
