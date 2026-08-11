## Manual steps before Electric sync can actually run

Boxes are checked only where directly verified; anything unverified is left unchecked.

---

## STOP — do not enable Electric in production until the shape allowlist has landed

Live sync must restrict data access to an approved, fixed list before it can run in production.
Right now nothing stops it from exposing every table in the database to any visitor, so turning
it on before that restriction lands would be a serious data leak.

Three separate safeguards currently keep production safe, and all three must stay in place until
the access restriction is finished: the live connection is not configured, the feature switch is
off, and the underlying service has never been started. The network permission needed later
already exists; only this configuration is missing.

---

### Local dev

- [x] Point local development at the correct database connection
- [ ] Confirm live data syncing is turned on for the development database
- [ ] Start the local sync service and confirm it connects to the development database
- [ ] Confirm the app still works if live sync is down, and once it is back up

### Production

Complete these in order — later steps depend on the first one.

- [ ] 1. Restrict live sync to only an approved, fixed list of data
- [ ] 2. Give the production sync service its database connection details
- [ ] 3. Redeploy the sync service's infrastructure so it starts successfully
- [ ] 4. Turn on live sync for production only once the service is healthy, otherwise deployment intentionally fails
- [ ] 5. Redeploy production and confirm the board and practice screens still work
- [ ] 6. Never weaken production authentication; only local development may relax it

#### Already done (was listed as outstanding, but isn't)

- [x] Infrastructure is applied automatically on every push to the main branch
- [x] The production sync service and its access permission already exist in the cloud project
- [x] Deployment resolves the sync service address automatically, gated on the feature switch

### Open questions / things to check once live

- Confirm whether an unhealthy, never-ready service instance is still being billed
- Confirm long-lived sync requests are not cut off early by a timeout in production
- Test the connection to the real production sync service, not just a local stand-in

## Notes

- Historical build record kept in build-log.md.
