# Signing and dependency: implementation report

## Item 1: signed requests only outside local dev

- Files: `apps/api/src/shared/env.ts`, `apps/api/src/shared/inngest-client.ts`, `apps/api/src/shared/inngest-serve.ts` (unchanged content, serve uses the client), `apps/api/.env.example`, `apps/api/README.md`, tests `apps/api/src/shared/env.durable.test.ts`, `apps/api/src/shared/inngest-client.test.ts`. `server.ts` needed no change.
- Behavior: `loadEnv` throws (message names `INNGEST_SIGNING_KEY` only, never a value) when `DURABLE_EXTRACTION` is `1` or `true`, `INNGEST_DEV` is not `1`, and the key is missing or blank. New optional `INNGEST_SIGNING_KEY_FALLBACK`. The client passes `signingKey` and `signingKeyFallback` from the environment (blank treated as unset). Option names confirmed in the installed SDK types: `apps/api/node_modules/inngest/types.d.ts:1051` (`signingKey`) and `:1056` (`signingKeyFallback`); `isDev` at `:968`.
- Tests: `npx vitest run src/shared/env.durable.test.ts src/shared/inngest-client.test.ts src/shared/inngest-serve.test.ts` from apps/api: 32 passed, 0 failed (env 26, client 2, serve 4). One existing test ("turn the pilot on") now sets `INNGEST_DEV=1`, since flag-on without a key now refuses to boot.
- tsc: `npx tsc --noEmit` in apps/api has one error, not mine: `src/knowledge-bit/extraction-inngest.workflow.test.ts(2,35)` cannot find `@inngest/test` (the other agent's file).
- Defaults: followed the spec literally, so the key is required for any engine value when the flag is on (the endpoint is mounted regardless of engine). Flag unset or `INNGEST_DEV=1` boots as before.
- Undone: the SDK itself still falls back to the raw env var for a blank key; env.ts rejects blank outside dev, so this only matters when the flag is off.
- Citation: `apps/api/src/shared/env.ts:64`

## Item 2: declare the dependency

- Files: `apps/api/package.json`, `package-lock.json`.
- Behavior: ran `npm install inngest@4.23.0 -w apps/api --save-exact` from the repo root (network worked). `apps/api/package.json` now has `"inngest": "4.23.0"`; the lockfile has an `apps/api/node_modules/inngest` entry at 4.23.0. Verified against `apps/api/node_modules/inngest/package.json` (4.23.0).
- Caveat: the lockfile diff is large (about 8,000 added and 4,600 removed lines). Cause: the committed lockfile was out of sync with the installed tree, so npm resynced it (for example nested `apps/api/node_modules/@vitest/*` entries). I did not hand-edit it. Review or regenerate before committing.
- Tests: covered by the runs above (SDK import works); no separate test.
- tsc: same single unrelated error as above.
- Defaults: exact pin, no caret.
- Undone: nothing for this item; the lockfile churn needs a human look.
- Citation: `apps/api/package.json:36`

END-OF-REPORT
