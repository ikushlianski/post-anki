---
type: todo
branch: doc-changelog-scan
task: doc-changelog-scan
updated: 2026-08-09
---

# Manual deploy steps — doc changelog scan

These steps must be done by a human before the scheduled document scan can run in production.

## 1. Store the shared secret

Add the scan job's shared secret to the production deployment configuration, matching the value the live backend already uses.

## 2. Deploy the change

Deploy so the new weekly scan job gets created in the cloud environment; this can also happen automatically on the next regular deploy.

## 3. Verify it worked

- Confirm a weekly scan job now exists for tracking documentation changes.
- Confirm the deployment configuration reports the new scan job by name.
- Manually trigger the scan and confirm it succeeds, recording a fresh check for each tracked tool.

## Notes
- Historical build record kept in build-log.md.
