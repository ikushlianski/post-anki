# Architecture notes

## Non-goals
- Not replacing the GCP deployment — this runs in parallel until the user decides to cut over (or
  runs both, e.g. GCP for bot/web, AWS for api/electric, per the current direction Scope).
- Not building CI/CD for this stack yet — first apply is a manual, credentialed, human-run step.
- Not adding a second Electric instance preemptively — one shared instance until a second app with
  its own separate database genuinely exists (direction's own out-of-scope line).

## Rollback
`pulumi destroy -s <aws-stack-name>` removes every resource this stack created; nothing else in the
repo or on GCP is touched. Safe to destroy and retry at zero risk to the live app.
