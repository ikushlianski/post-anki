## Manual steps before this can actually run (nothing below was done autonomously — deploy/hosting decisions were explicitly deferred to you)

### Local dev (do this first — lower risk, no cloud changes)
- [ ] Confirm/enable logical replication on the Neon **`dev`** branch (only `main` was confirmed enabled tonight) — https://console.neon.tech/app/projects/cool-fog-32155538
- [ ] `docker compose up -d electric` and confirm it connects (uses `ELECTRIC_DATABASE_URL` in the new root `.env`, derived from `apps/api/.env`'s pooled `DATABASE_URL` by stripping `-pooler` — sanity-check that string once)
- [ ] `npm run dev`, open the board (`/`), confirm it still renders (SSR fallback works even with Electric down); once Electric is up, confirm it's syncing (no visual change expected yet — this is plumbing, not a UI change)

### Production (defer until you've decided hosting — spec assumed self-host on Cloud Run; you can revisit this)
- [ ] `pulumi config set --secret electricDatabaseUrl <neon-main-direct-connection-string>` (direct/non-pooled, same transformation as dev: strip `-pooler`)
- [ ] `pulumi up` (new Electric Cloud Run service, `minScale:1`, private/IAM-gated — review the diff before applying, this is a new always-on billable service, unlike the other 3 which scale to zero)
- [ ] Wire `ELECTRIC_SERVICE_URL` (from Pulumi's new `electricServiceUrl` export) into `apps/api`'s Cloud Run env vars in `.github/workflows/deploy.yml`
- [ ] Do NOT set `ELECTRIC_AUTH_MODE` in production env vars — leave unset so it defaults to `"iam"` (Cloud Run service-to-service auth)

### Known gaps flagged by the implementing agents (not blockers, just things to check once live)
- Electric's `live=true` long-poll requests (~20s) — confirm `google-auth-library`/`gaxios`'s default timeout doesn't cut them off in production
- The apps/api → Electric leg is genuinely untested end-to-end (no live Electric service existed during this pass) — first real test happens when you bring `docker compose up electric` up locally
