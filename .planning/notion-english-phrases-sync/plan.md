# Notion English phrases daily import

## Built
- Connector `english-phrases-3` (notion-connectors.json), destination kind `knowledge-source` {subjectPath "English", maxPerRun 10, deleteAfterImport true}; no tag needed.
- Daily Cloud Scheduler job `post-anki-notion-english-phrases` (`notionEnglishPhrasesSchedule`, default `0 7 * * *`) POSTs `/notion-english-phrases` with the shared-secret bearer.
- Per run: read top-level bullets of the page; skip empty bullets, non-bullets, and bullets with nested children (deleting would trash unseen content).
- Per line, sequentially: file as pending knowledge source (key `notion:<blockId>`, idempotent) -> write `notion_import_log` row -> delete Notion block (trash, restorable ~30 days) -> set `deleted_at`.
- File/log failure: line not deleted, run continues. Delete failure: `delete_error` set, warning logged, next run re-files (already present) and retries delete.
- Notion 401/403/unauthorized/restricted_resource: run aborts, route returns 403 `notion_access_denied`.
- `runNotionSync` ignores knowledge-source connectors. Dockerfile now copies notion-connectors.json to /app.

## Prerequisites
- Server `NOTION_TOKEN` (already deployed) belongs to a Notion integration with Read content and Update content capabilities.
- Page 'English Phrases 3' shared with that integration with edit access.
- Apply migration 0168 (notion_import_log) via the normal migrate script before first run.
- Deploy Pulumi for the scheduler job (not run yet).

## Dry run
`POST /notion-english-phrases?dryRun=1` with `Authorization: Bearer $API_SHARED_SECRET` reports counts, files and deletes nothing. `?limit=N` lowers the cap (never raises it above maxPerRun).

## Restore
- `listRestorableImports("english-phrases-3")` (notion-import-log.repo.ts) lists rows with `deleted_at` set, oldest first, with `original_text` verbatim.
- Restore from Notion trash within ~30 days, or re-add `original_text` as a bullet. Rows with `delete_error` were filed but not removed.
