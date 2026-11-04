---
type: research
state: draft
updated: 2026-10-25
---
# Cloud Run shutdown resilience (prod and dev Neon branches)

## Question
How should the post-anki API survive Cloud Run stopping, pausing or replacing an instance, and Neon closing connections when a branch suspends, on both the prod (`main`) and `dev` Neon branches?

## Facts
- Cloud Run sends SIGTERM, then SIGKILL 10 seconds later; the instance keeps CPU during those 10 s. Source: https://docs.cloud.google.com/run/docs/container-contract
- With request-based billing (the default, used by all post-anki services), "CPU is only allocated during request processing". Instance-based billing keeps CPU for the instance's whole life and is billed for all of it. Source: https://docs.cloud.google.com/run/docs/configuring/billing-settings
- An idle instance is kept at most 15 minutes unless minimum instances are set. Source: container contract above.
- Cloud Run request timeout: default 300 s, maximum 3600 s. Source: https://docs.cloud.google.com/run/docs/configuring/request-timeout
- Cloud Tasks HTTP targets: default dispatch deadline 10 minutes, maximum 30 minutes, OIDC tokens recommended for Cloud Run handlers. Source: https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks
- Inngest free plan: $0, 50k executions a month (each run and each step counts), 5 concurrent steps, 24 h history, execution pauses at the quota. Source: https://www.inngest.com/pricing
- The API already has a durable job engine behind flags `DURABLE_EXTRACTION`, `DURABLE_CARDS`, `DURABLE_COURSE_JOBS`; turning any on outside local dev requires `INNGEST_SIGNING_KEY` (`apps/api/src/shared/env.ts:73-92`). A DBOS engine also exists for extraction (`DURABLE_EXTRACTION_ENGINE`, default `dbos`).
- The API shutdown handler calls `server.close()` without waiting for in-flight requests, then closes the database and exits at once (`apps/api/src/server.ts:20-34`).
- The app database pool now logs, instead of crashing on, an idle connection the server closes (`apps/api/src/db/client.ts`).
- About 11 non-test modules start work without awaiting it (for example cards compile and fan-out, notion sync, learning-list fold-in, knowledge-source regeneration, topic and knowledge-bit review controllers).

## Assumptions
- Work started after a response is sent gets little or no CPU under request-based billing, so it stalls until the next request, and is lost when the instance is stopped. Inferred from the CPU rule above, not stated by the docs.
- Neon wakes a suspended branch in well under the pool's 10 s connection timeout.

## Recommended approach
1. Durable engine for every background job in prod: Inngest Cloud free plan calls the API over HTTP for each step, so each step runs inside a request and gets CPU, and a stopped instance only means a retried step. Cost $0 within 50k executions a month.
2. Graceful shutdown inside the 10 s window: stop accepting, wait for in-flight requests up to about 8 s, then close tracing and the pool.
3. No work after the response: every remaining fire-and-forget path either goes through the durable engine or finishes before replying.
4. Neon connection drops: pool error handler (done); retry a query once on a connection-level error such as 57P01 or a reset, on both branches.
5. Dev parity: local dev uses the Inngest dev server (`INNGEST_DEV=1`) against the Neon `dev` branch; prod uses Inngest Cloud's production environment against Neon `main`.

## Rejected
- Instance-based billing or minimum instances: keeps CPU for background work but bills around the clock, which breaks the about-$0 budget.
- Cloud Tasks: works and is free at this volume, but duplicates the Inngest engine the code already has.

## To verify
- Inngest Cloud reaches the API through its Cloud Run URL with the signing key (needs the owner's Inngest account).
- Which in-process paths the three durable flags already cover, and which remain fire-and-forget.
