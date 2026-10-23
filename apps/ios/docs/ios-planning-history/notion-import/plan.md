# Notion import as a knowledge source

## Goal
Covers the single coding task in `.planning/notion-import/todo.md`: paste the id of a Notion database (data source), import its rows as knowledge sources, continue a large import in chunks, and kick off item detection so the new items appear in the Review tab.

Batch A, built fourth. Adds one row to `HomeDailySection.swift` (created by daily-push).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/daily-push/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /knowledge-sources/notion` | `apps/api/src/router-table.ts:18`, `apps/api/src/api-server.ts:450-451`, `apps/api/src/knowledge-source/notion-knowledge-source.controller.ts:87-126` | `{ dataSourceId, startCursor? }`; id must be a Notion UUID with or without dashes (`notion-knowledge-source.controller.ts:10-17`) | `{ created: Int, truncated: Bool, nextCursor: String? }` (`notion-knowledge-source.controller.ts:121-125`; `nextCursor` decoded as optional) | 400 `invalid_input` (bad id format), 400 `invalid_notion_source` (Notion can't read it, `:109-113`), 500 (Notion outage, rate limit, or no Notion token on the server) |
| `POST /knowledge-sources/detect-bits` | `router-table.ts:19`, `api-server.ts:452-453`, `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts:20-32` | no body | scan summary (ignored) | 502 `scan_failed` |

- One call imports at most 500 rows (`apps/api/src/knowledge-source/knowledge-source.repo.ts:75`); `truncated: true` plus `nextCursor` means more remain. Re-sending a cursor is safe: already-imported rows are skipped (`notion-knowledge-source.controller.ts:40`).
- The detect call is the same one the app already makes after dictation (`Sources/PostAnkiIOS/IngestionDictationScreen.swift:39`); a scheduled job also runs it.

## Dropped
- Browsing Notion databases or connectors to pick one: no route lists them; the learner pastes the id.
- Choosing a subject for imported rows: the Notion import route takes no subject.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `NotionImport*`:
- `API/NotionImportModels.swift` (~20 lines): `NotionImportInput { dataSourceId; startCursor: String? }` (omit nil), `NotionImportResult`.
- `API/APIClient+NotionImport.swift` (~15 lines): `importNotionSource(dataSourceId:startCursor:)`.
- `NotionImportModel.swift` (~90 lines), `NotionImportScreen.swift` (~110 lines).

Read-only reuse: `APIClient.detectKnowledgeBits()`, `StudyToolsError`.

## Screens and behaviour
- Entry: row "Import from Notion" (`square.and.arrow.down.on.square`) in `HomeDailySection`'s "Find and import" section.
- `NotionImportScreen` (Form):
  - Field "Notion database id" with help text "Open the database in Notion, copy its link, and paste the id (the 32-character part)." The model extracts the first 32-hex-character (or dashed UUID) run from a pasted link before sending; "Import" is disabled until one is found.
  - "Import" posts without a cursor. While running: "Importing from Notion..." spinner, field and button disabled.
  - Result: "Imported N new items." If `truncated`, a "Continue import" button posts again with `nextCursor`; running totals add up across chunks ("Imported N so far").
  - After the final chunk (not truncated) with any created rows, call `detectKnowledgeBits()` (`try?`, errors ignored like dictation does) and show "New items will appear in Review once they're ready." When `created == 0`: "Nothing new. Everything in this database was already imported."
- Errors: 400 `invalid_input` or `invalid_notion_source` "Notion couldn't open that database. Check the id and that the integration has access."; 500 "The server couldn't reach Notion. Try again later."; offline message.

## Shared files
None outside batch A. `HomeDailySection.swift` (batch A): one row.

## Edge cases
- Leaving the screen mid-import: the request finishes on the server; returning starts fresh (nothing persisted locally), and re-running is safe because of dedupe.
- Tapping Import twice: second tap ignored while running.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: import a small test database, see "Imported N", then find the items in the Review tab after detection.

## Defaults
- Detection is triggered once at the end, not per chunk.
- The last-used database id is not stored.
