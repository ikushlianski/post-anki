## Manual steps before Electric sync can actually run

Refreshed 2026-08-01 against the live prod project and this checkout. Boxes are ticked only where
there is direct evidence; anything unverifiable is left unticked with the reason.

---

## STOP — do not enable Electric in production until the shape allowlist has landed

`apps/api`'s shape proxy must build the shape definition (table, columns, any base filter)
server-side from a fixed allowlist. Until that is merged, the proxy forwards whatever table the
caller names, and `apps/web`'s `/api/electric-shape` route is reachable by any site visitor with no
auth of its own — so turning Electric on in prod would stream **every table in the database** to
anyone who loads the site. Electric's own auth guidance says the same thing: shape definition
params "must be set server-side" because "letting clients specify the table allows access to any
table" (https://electric.ax/docs/guides/auth).

Three things currently keep production safe, and **all three must stay in place until the allowlist
is merged**:
- `apps/api` has no `ELECTRIC_SERVICE_URL`, so `electric-proxy.service.ts` throws on every request.
- The `PROD_ELECTRIC_ENABLED` repository variable is unset, so the deploy workflow never sets that
  variable.
- The `post-anki-electric` Cloud Run service has never started (no `DATABASE_URL`), so it has no
  URL to point at.

Note what is *already* in place: `post-anki-api@post-anki.iam.gserviceaccount.com` already holds
`roles/run.invoker` on `post-anki-electric` (verified via `gcloud run services get-iam-policy`).
The network path is open; only the missing config keeps it shut.

---

### Local dev

- [x] Root `.env` has `ELECTRIC_DATABASE_URL` pointing at the Neon **dev** branch with the direct
      (non-pooled) host — verified by reading `.env`; host is
      `ep-muddy-union-athd4wsw.c-9.us-east-1.aws.neon.tech` with no `-pooler`.
- [ ] Confirm/enable logical replication on the Neon **`dev`** branch —
      https://console.neon.tech/app/projects/cool-fog-32155538
      **Not verifiable from this machine**: the Neon MCP returns HTTP 404 for this project id, and
      nothing in the repo records the setting. Needs a look at the Neon console.
- [ ] `docker compose up -d electric` against the dev database and confirm it connects.
      **Not done / not currently running**: `docker ps -a` shows no `post-anki-dev-electric`
      container. The only Electric container up is `post-anki-e2e-electric` (healthy, same
      `electricsql/electric:1.7.7` image) and it points at the local `postanki_e2e` Postgres, not
      at Neon — so it proves the image and the app wiring work, but says nothing about the Neon dev
      branch.
- [ ] `npm run dev`, open the board (`/`) and a practice screen (`/practice/:subjectId`), confirm
      both still render with Electric down (SSR/fetch fallback), then confirm live sync once
      Electric is up.

### Production

Do these strictly in order. Steps 2-5 are all gated on step 1.

- [ ] **1. Merge the server-side shape/table allowlist in `apps/api/src/electric/`.** Hard blocker —
      see the warning above. The allowlist must cover the six tables actually in use today:
      `subjects`, `curricula`, `sources` (narrowed to `id`, `curriculum_id`, `kind`), `phrases`,
      `attempts`, `language_practice_settings`.
- [ ] **2. `pulumi config set --secret electricDatabaseUrl <neon-main-direct-connection-string>`**
      (direct/non-pooled — strip `-pooler` from the host, same transformation as dev). Not done:
      `infra/Pulumi.prod.yaml` has no such key. This is why the service cannot start.
- [ ] **3. Re-run the `Infra` job so the Electric service gets a healthy revision.** Note `pulumi
      up` itself has already run — see below — but every revision so far has failed to start.
- [ ] **4. Set the `PROD_ELECTRIC_ENABLED` repository variable to `true`** (GitHub → repo Settings →
      Secrets and variables → Actions → Variables, `prod` environment or repo scope, matching how
      `PROD_WEB_ENABLED` is set). This is the switch that makes `.github/workflows/deploy.yml`
      resolve the Electric URL and set `ELECTRIC_SERVICE_URL` on `apps/api`.
      Behaviour to be aware of: with the variable `true` and the Electric service unhealthy, the
      **API deploy fails loudly** rather than silently skipping. That is deliberate — an empty
      `ELECTRIC_SERVICE_URL` would fail `apps/api`'s env schema (`z.string().min(1)`) and stop the
      API booting at all, so failing in CI is strictly better than shipping a dead API.
- [ ] **5. Re-run the deploy** so `apps/api` picks up `ELECTRIC_SERVICE_URL`, then check the board
      and practice screens in prod.
- [ ] **6. Never set `ELECTRIC_AUTH_MODE` in production.** The workflow deliberately does not set
      it; `apps/api`'s env schema defaults it to `"iam"` (Cloud Run service-to-service ID tokens).
      Only local dev sets `"none"`.

#### Already done (was listed as outstanding, but isn't)

- [x] `pulumi up` — the `Infra` job runs it on every push to `main` and succeeded on 2026-07-18
      (run 29650106449) and 2026-07-31 (run 30610046092), both after the Electric infra landed in
      `292d346` on 2026-07-16.
- [x] The `post-anki-electric` Cloud Run service and its `electric-invoker` IAM binding exist in the
      `post-anki` project, region `europe-west1` — verified with `gcloud run services list` and
      `gcloud run services get-iam-policy`.
- [x] `ELECTRIC_SERVICE_URL` wiring in `.github/workflows/deploy.yml` — added 2026-08-01. The
      `deploy-api` job resolves the URL with `gcloud run services describe post-anki-electric
      --format='value(status.url)'` (the same mechanism the workflow already uses for `API_URL`),
      gated on `PROD_ELECTRIC_ENABLED`. There is no Pulumi-output-reading mechanism in this
      workflow and none was added; reading the URL back off Cloud Run is equivalent and cannot
      drift from the `electricServiceUrl` stack output.

### Open questions / things to check once live

- The service currently sits at `minScale: 1` with a crash-looping revision. **Unverified:** whether
  a never-ready revision at `minScale: 1` is being billed. Worth checking the `post-anki` billing
  breakdown for `post-anki-electric` since 2026-07-18 before assuming it costs nothing.
- Electric's `live=true` long-poll requests (~20s) — confirm `google-auth-library`/`gaxios`'s
  default timeout doesn't cut them off in production.
- The `apps/api` → Electric leg has never run against a real Cloud Run Electric instance. The e2e
  stack exercises the same code against a container-local Electric, so the untested part is
  specifically the GCP ID-token/IAM hop.
