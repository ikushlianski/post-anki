# Local-first Electric sync build log

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
