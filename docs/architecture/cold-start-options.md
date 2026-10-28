# Cold start options

The first request to the API after idle waits for the container to boot. Prod runs on GCP Cloud Run at zero minimum instances.

## Cause and fix

- The container used to run the TypeScript source through `tsx`; its boot took 29.3 s from instance start to listening (Cloud Run log, 2026-10-28).
- The image now bundles the server at build time (`apps/api/scripts/build-server.ts`) and starts from the bundle; locally it listens in 0.8 s against 2.4 s for the old start.
- The API deploy passes `--cpu-boost`, which adds CPU only while the container starts.

## Keep-warm ping

Not adopted. A ping from Cloud Scheduler needs one more job in a project that already has 15, and Cloud Scheduler includes only 3 free jobs per billing account (assumption from provider pricing, not re-checked). The existing 5-minute jobs target `api.postanki.ilya.online` and report error code 13, so they do not keep the API warm today.

## Hosting alternatives

| Option | Free tier | Cold start | Fit for this API |
|---|---|---|---|
| GCP Cloud Run (current) | 2M requests, 180,000 vCPU-s, 360,000 GiB-s a month | Seconds once the bundle is used | Runs the API unchanged |
| AWS Lambda | 1M requests, 400,000 GB-s a month | About 0.1-3 s for Node (blog reports) | The API already has a Lambda handler and build |
| Cloudflare Workers | 100,000 requests a day, 10 ms CPU per request | Milliseconds (blog reports) | Poor, see below |

Sources: flaviocopes.com/hosting-free-tiers, developers.cloudflare.com/workers/platform/limits, blog.codercops.com/blog/serverless-cold-starts-explained-2026.

## Workers fit

Not recommended. The API opens Postgres connections over TCP, runs the DBOS durable-job SDK, and reads files from disk in several modules, and Workers' free plan caps CPU at 10 ms per request. Mastra has a Cloudflare deployer, but its Postgres support there is unconfirmed. Moving would be a rewrite for a gain the bundle fix is expected to deliver already.
