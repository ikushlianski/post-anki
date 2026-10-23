# PowerSync spike: subjects and topics, offline in the Mac app

Syncs the `subjects` and `topics` tables (topics: id, curriculum_id, module_id, title, order, included) from dev Postgres (`post-anki-dev-db`, port 5562) through a self-hosted
PowerSync service (Open Edition) into a local SQLite database in the PostAnkiMac Debug build, and
lists it from that local database. Decision background: `docs/architecture/native-sync-decision.md`.

Read-only spike: no writes, no upload queue, unscoped tables.

## What runs where

- Source: `postanki_dev` on `post-anki-dev-db`. `scripts/setup.sh` creates role `powersync_role`
  (replication, SELECT on `subjects` and `topics` only) and publication `powersync` for `public.subjects` and `public.topics`.
- Bucket storage: database `powersync_storage` and user `powersync_storage_user` on the same Postgres server.
- Service: `docker-compose.powersync.yml`, container `post-anki-powersync`, host port 5590 (localhost only).
  Port 8080 is not used because the devports registry already lists it for other projects; 5590 is
  not in the registry (register it there if this outlives the spike).
- Auth: PowerSync fetches the public key set from the API (`jwks_uri: http://host.docker.internal:5560/sync-keys`,
  served by `apps/api`, ES256). Clients get a 5 minute token from `POST /sync-tokens` with their personal API token.
  Fallback: the static HS256 dev key (`kid: dev-key-1`, value from the gitignored `.env`) is kept commented in
  `powersync/service.yaml`.
- Sync config: `powersync/sync-config.yaml` (Sync Streams edition 3, one auto-subscribed stream).

## Run

1. Start dev Postgres: `docker compose up -d postgres` from the repo root.
2. `apps/ios/spike/scripts/setup.sh` (creates `spike/.env` with random secrets, roles, publication, storage DB; safe to re-run).
3. `docker compose -f apps/ios/spike/docker-compose.powersync.yml up -d`
4. Check replication: `docker logs post-anki-powersync` shows `Replicating "public"."subjects" 18/?`
   and `Activated new replication stream`.
5. Get a token, either way:
   - API (default, verified live): add `SYNC_JWT_PRIVATE_KEY` to the gitignored `apps/api/.env.local` (generation command
     in `apps/api/.env.example`; never print or commit it). Mint a personal API token once:
     `cd apps/api && set -a && . ./.env.local && set +a && npx tsx scripts/create-api-token.ts "<label>"` (shown once, keep it).
     Start the API with `npm run dev:api` (port 5560, listens on all interfaces, so the container reaches it through
     `host.docker.internal`), then `docker restart post-anki-powersync` so the service reads the key set, and:
     `curl -s -X POST -H "Authorization: Bearer <api token>" http://127.0.0.1:5560/sync-tokens` and copy `token`.
     The app does not need a pasted token: it fetches its own (see "Token refresh"). Copy `token` only for the manual
     `POST /sync/stream` check below. Check: `POST /sync/stream` with the token
     returns a checkpoint, a tampered token returns 401 `PSYNC_S2101`, and the service log shows
     `Sync stream started` with `user_id` = the personal API token id.
   - Dev-token fallback: swap the `client_auth` block in `powersync/service.yaml` to the commented HS256 key,
     restart the container, and run `apps/ios/spike/scripts/dev-token.sh` (JWT valid for 12 hours).
6. In `apps/ios/Local.xcconfig` (gitignored) set the service address; leave the token empty for the API path
   (set it to a 12 hour dev-token only as a fallback):
   ```
   POSTANKI_POWERSYNC_URL = http:/$()/127.0.0.1:5590
   POSTANKI_POWERSYNC_TOKEN =
   ```
   In the app, Settings must hold the dev API address (`http://127.0.0.1:5560`, or `POSTANKI_DEV_API_URL` in the
   same file) and the personal API token from step 5.
7. `cd apps/ios && xcodegen generate`, open the project, run scheme `PostAnkiMac` (Debug), or build with
   `xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiMac -destination 'platform=macOS' -derivedDataPath build CODE_SIGNING_ALLOWED=NO build`
   (the incremental build takes about 15 s). Delete `powersync-spike.sqlite*` first to prove a fresh sync.
8. In the app choose File > PowerSync Spike (Cmd-Option-Shift-P). The headers read
   "subjects (18 rows from local SQLite)", then a second list "topics (N rows from local SQLite)" and the sync line shows "connected".

## Token refresh

The connector (`Spike/SpikeCredentialsProvider.swift`) implements `fetchCredentials`: each call posts to
`POST /sync-tokens` through `APIClient.createSyncToken()` (saved server address, personal API token from the
Keychain) and returns the PowerSync URL from Info.plist plus the fresh token. powersync-swift calls it again
shortly before the token expires and on a 401, so sync continues past 5 minutes. If the call fails (or no API token
is saved) it falls back to `POSTANKI_POWERSYNC_TOKEN` when set, otherwise the error is surfaced and the SDK retries.
Debug builds only. Unit tests: `Tests/PostAnkiMacRegistryTests/SpikeCredentialsProviderTests.swift`.

## Verify offline

1. With the window showing rows and "connected", quit the app.
2. `docker stop post-anki-powersync` (or turn the network off).
3. Relaunch the app and open File > PowerSync Spike. All rows still show, read from local SQLite; the sync
   line shows "connecting, synced before" while it retries.
4. `docker start post-anki-powersync` brings it back to "connected". Changing a subject name in Postgres
   shows up in the open window within seconds.

The local database is `powersync-spike.sqlite`: under `~/Library/Application Support/databases/` for an
unsigned build, inside the app container for a signed sandboxed build. Inspect with `sqlite3 -readonly`.

## Reset

- `docker compose -f apps/ios/spike/docker-compose.powersync.yml down`
- Remove the replication slot so Postgres does not retain WAL:
  `docker exec post-anki-dev-db psql -U postanki -d postanki_dev -c "select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name like 'powersync_%'"`
- Local copy: delete `powersync-spike.sqlite*` (see location above).

## Files

- `docker-compose.powersync.yml`, `powersync/service.yaml`, `powersync/sync-config.yaml`
- `sql/setup.sql`, `scripts/setup.sh`, `scripts/dev-token.sh`
- `.env` (gitignored secrets), `.env.example` (shape only)
- App code: `apps/ios/Sources/PostAnkiMac/Spike/` (Debug builds only), token call in
  `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient+SyncTokens.swift`, SDK pin in `apps/ios/project.yml`
