# Durable background jobs: Inngest hardening

## The ask

Use the Inngest features that bound cost and protect the job endpoint, and move the most-used
fire-and-forget job onto Inngest. Research and evidence: `inngest-features-report.md` in this folder.

## Items and their report section

1. Signed requests only outside local dev (report item 1): with `DURABLE_EXTRACTION=1` and
   `INNGEST_DEV` not `1`, boot fails without `INNGEST_SIGNING_KEY`; pass the key (and optional
   `INNGEST_SIGNING_KEY_FALLBACK`) to the client/serve; document both in `apps/api/.env.example`.
2. Declare the dependency (report item 2): add the installed `inngest` version to
   `apps/api/package.json` and update the lockfile through npm.
3. Time limit (report item 2): `timeouts` on the extraction function so a stuck run is cancelled
   and the existing failure path marks the source failed.
4. Retry policy (report item 3): low retry count, `NonRetriableError` for refusals, injection
   blocks and invalid input, `RetryAfterError` on provider 429 with its retry-after value. Inner
   model-wrapper retries and step retries must not multiply.
5. Throttle (report item 4): `throttle` on extraction starts, queueing not dropping.
6. One run per source (report item 5): `singleton` keyed on `sourceId`; the DB claim stays the guard.
7. Text out of step results (report item 6, cheaper option): step return values carry ids and
   counts only; text is read from the database inside the step that uses it.
8. Durable pipeline kick (report item 8, first job only): the pass that turns approved sources into
   questions runs as an Inngest function when `DURABLE_EXTRACTION=1`, with the in-process kick kept
   as the fallback when it is off.

## Done when

Each item has co-located vitest coverage of its rule, `tsc --noEmit` is clean in apps/api, and
local dev with `DURABLE_EXTRACTION` unset behaves exactly as today.
