# Notion sync agent

A macOS LaunchAgent that runs `npm run notion:sync -w @post-anki/api` every 15 minutes while this
Mac is on. Each run reads the connectors in the repo-root `notion-connectors.json`, pulls tagged
notes from Notion, and routes them: `SPA` notes become facts in post-anki's database, `CRM` notes
become items in the CRM repo's `.planning/todo.md`. Already-imported notes are skipped.

Semantics: the agent only exists while the Mac is on and you are logged in. Missed intervals are
skipped, never replayed. Nothing is deployed.

## Setup

1. Put these in `apps/api/.env.local` (or `.env`):
   - `NOTION_TOKEN` — a Notion internal-integration token. Read-only capabilities are enough unless a
     connector sets `removeAfterImport`. Share each source page/database with the integration in
     Notion (page menu → Connections).
   - `DATABASE_URL` — the production Postgres URL (facts and sync records are written there).
2. Fill `notion-connectors.json`: each connector's `source.id` is a Notion page or database id, or its
   full URL. The sample ids beginning with `REPLACE_WITH_` are refused until replaced.
3. Install:

   ```sh
   scripts/notion-sync-agent/install.sh
   ```

   Status: `launchctl print gui/$(id -u)/com.postanki.notion-sync`. Log:
   `~/Library/Logs/post-anki/notion-sync.log`. While `NOTION_TOKEN` is unset the run logs one
   "skipping" line and exits 0.

## Uninstall

```sh
scripts/notion-sync-agent/uninstall.sh
```

## `removeAfterImport`

When a connector sets it to `true`, imported paragraph blocks are deleted and imported database rows
are archived in Notion. That needs a token with update/insert capabilities; with a read-only token
the import succeeds and the removal fails, so the note stays in Notion but is not re-imported.
