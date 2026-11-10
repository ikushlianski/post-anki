# Custom web domain in the API origin allow-list

Nothing committed, apps/api/.env and the local Docker DB untouched, nothing deployed, apps/web not edited.

## Facts found in the code

- The API accepts a browser origin only if it equals `WEB_ORIGIN` (or the Chrome extension origin): `apps/api/src/shared/cors.ts`, called from `apps/api/src/api-server.ts` (CORS block near line 353). Any other `Origin` gets 403 `origin_not_allowed`; requests without `Origin` (server-side callers) are allowed.
- The GCP deploy (`.github/workflows/deploy.yml`, step "Deploy API to Cloud Run") sets `WEB_ORIGIN` to the Cloud Run URL of `post-anki-web` (`status.url`). So the claim holds for that deploy: a browser loading the site from `https://postanki.ilya.online` and calling the API directly would be refused.
- The AWS stack (`infra-aws/index.ts:376`) already sets `WEB_ORIGIN` to `https://postanki.<domain>` (the custom domain), so it needs no change.

## What changed

- `apps/api/src/shared/env.ts`: new optional `WEB_ORIGINS` (comma separated extra exact origins).
- `apps/api/src/shared/cors.ts`: new `parseExtraWebOrigins` (parsed once per value, cached; each entry must be an https origin with no path and already in canonical lower case form, or http on localhost/127.0.0.1/[::1]; invalid entries are ignored with a `web_origins_entry_ignored` warning); `resolveCorsDecision` merges them with `WEB_ORIGIN` and compares by exact string equality (no wildcard, no suffix match, no reflecting an unknown origin, `null` never allowed). Preflight handling and credentials rules in `api-server.ts` are unchanged.
- `apps/api/src/api-server.ts`: passes `extraWebOrigins: parseExtraWebOrigins(env.WEB_ORIGINS)`.
- `.github/workflows/deploy.yml`: one added line in the API deploy command: `--set-env-vars "WEB_ORIGINS=${{ vars.PROD_WEB_EXTRA_ORIGINS || 'https://postanki.ilya.online' }}"`, following the file's existing `vars.* || default` pattern.
- `docs/architecture/extension/highlight-capture.md`: describes `WEB_ORIGINS` (present tense).
- `apps/api/src/shared/cors.test.ts`: tests for exact match, lookalike host, sibling subdomain, http variant, other port, trailing slash, upper case host, the literal `null`, no-Origin requests, `WEB_ORIGIN` alone, parsing (trim, invalid entries ignored with 6 warnings, parsed once).

## Verification (real output)

- `npx tsc --noEmit` in apps/api: exit 0; in packages/shared: exit 0.
- `npx vitest run src/shared/cors.test.ts`: Tests 21 passed (21).
- `npx vitest run` in apps/api: Test Files 164 passed (164), Tests 1552 passed (1552).

## Left for the user

- Deploy: the new line takes effect on the next run of the deploy workflow. After it, check in the browser that the site on `https://postanki.ilya.online` can call the API (no 403 `origin_not_allowed`). Nothing was deployed here.
- `gcloud run deploy` with several `--set-env-vars` flags is the workflow's existing pattern; if gcloud keeps only the last flag in your version, the existing variables would already be affected, so check the deployed service's env vars once after the next deploy.

END-OF-REPORT
