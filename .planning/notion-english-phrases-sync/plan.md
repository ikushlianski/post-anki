# Notion English phrases daily import

## Built
- Connectors `english-phrases-1` (page 366dec4d) and `english-phrases-3` (page 2dfdec4d; its child page "English Phrases 2" is reached by recursion) in notion-connectors.json, destination kind `knowledge-source` {subjectPath "English", maxWords 10, maxPhrases 10, recursive true, deleteAfterImport true}; no tag needed.
- Daily Cloud Scheduler job `post-anki-notion-english-phrases` (`notionEnglishPhrasesSchedule`, default `0 7 * * *`) POSTs `/notion-english-phrases` with the shared-secret bearer.
- Per run: walk the page in document order, paginating with start_cursor. With `recursive` it descends into `child_page` blocks and into the children of bullets (depth cap 5). A shared visited set means no page or block is processed twice, also across connectors in one run.
- Importable note = non-empty bulleted leaf (no children). Bullets with children are group headers: never imported, never deleted, left on the page even when emptied. Other block types are ignored (child pages are still entered).
- Quotas: `maxWords` and `maxPhrases` per connector, independent. Word = exactly one whitespace token (surrounding punctuation and lone "?" ignored), else phrase. The walker takes the first notes in document order that fit the remaining quota and stops reading Notion once both are full.
- Scan cap: 1500 blocks per connector run; `scanLimitReached` is reported in the result when it stops there.
- Dedupe: before filing, the subject's knowledge sources are checked for equal normalized raw_text (trim, collapse whitespace, curly to straight quotes, lowercase, strip trailing punctuation and ellipsis). On a hit nothing is filed; the log row (verbatim text, existing source id) is written, then the Notion block is deleted. Duplicates do not use up quota; they are counted as `duplicates`.
- Per line, sequentially: file as pending knowledge source (key `notion:<blockId>`, idempotent) -> write `notion_import_log` row -> delete Notion block (trash, restorable ~30 days) -> set `deleted_at`.
- File/log failure: line not deleted, run continues. Delete failure: `delete_error` set, warning logged, next run re-files (already present) and retries delete.
- Notion 401/403/unauthorized/restricted_resource: run aborts, route returns 403 `notion_access_denied`.
- `runNotionSync` ignores knowledge-source connectors. Dockerfile now copies notion-connectors.json to /app.

## Prerequisites
- Server `NOTION_TOKEN` (already deployed) belongs to a Notion integration with Read content and Update content capabilities.
- Pages 'English phrases 1' and 'English Phrases 3' (and so its subpage) shared with that integration with edit access.
- Apply migration 0168 (notion_import_log) via the normal migrate script before first run.
- Deploy Pulumi for the scheduler job (not run yet).

## Dry run
`POST /notion-english-phrases?dryRun=1` with `Authorization: Bearer $API_SHARED_SECRET` reports counts, files and deletes nothing. `?limit=N` lowers both maxWords and maxPhrases (never raises them above config). Dry run skips the dedupe lookup. Result reports `words` and `phrases` as imported/skipped/failed, plus `duplicates`, `blocksScanned`, `scanLimitReached`.

## Restore
- `listRestorableImports("english-phrases-3")` (notion-import-log.repo.ts) lists rows with `deleted_at` set, oldest first, with `original_text` verbatim.
- Restore from Notion trash within ~30 days, or re-add `original_text` as a bullet. Rows with `delete_error` were filed but not removed.

## Adding another page
- `POST /notion-english-phrases` imports every enabled knowledge-source connector in notion-connectors.json, one after another; a failing page does not stop the others (non-2xx only if a page failed, body lists every page).
- Add an entry to notion-connectors.json: `name`, `source: {kind:'page', id:<page id>}`, `destination: {kind:'knowledge-source', subjectPath:'English', maxWords:10, maxPhrases:10, recursive:true}`.
- Share the page with the Notion integration (edit access).
- Redeploy.
