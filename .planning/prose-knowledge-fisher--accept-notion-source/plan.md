# Accept a Notion database as a prose knowledge source

## Goal
Let a Notion database (any data source, not the existing hardcoded Biz Education one) be pulled in
as knowledge sources, alongside pasted prose. One `knowledge_sources` row per Notion database row,
with `kind: "notion"`. Reuses the existing Notion connector (`../notion-connector/notion.client.js`,
`@post-anki/core`'s `itemsFromDatabaseRows`) — never a new Notion client or a copy of the
biz-education pipeline's PA-tag filtering/sync-marking logic (out of scope, per this direction's
Scope: "the existing Biz Education Notion pipeline... stays separate").

## Design
Add `notionDatabaseId` (text, nullable) and `notionPageId` (text, nullable, unique-indexed) to
`knowledgeSources` — set only for `kind: "notion"` rows. `notionDatabaseId` mirrors `sourceRef`-style
provenance already used elsewhere in this schema (e.g. `facts.sourceRef`); `notionPageId` is the
dedupe key that stops a re-import of the same database from duplicating every row.

`POST /knowledge-sources/notion` with `{ "dataSourceId": string }` body:
1. `collectAllDataSourceRows(getNotionClient(), { data_source_id: dataSourceId })`, filter
   `isFullPage`, wrapped in try/catch — a bad/inaccessible `dataSourceId` or any Notion-side error
   returns `400 {error: "invalid_notion_source"}`, never an opaque 500
2. `itemsFromDatabaseRows(rows)` → `{id, text, tags}[]` (existing helper, same one biz-education
   uses)
3. Insert up to `MAX_ROWS_PER_IMPORT = 500` rows per call (caps unbounded Notion crawls and the
   downstream LLM bit-detection cost they'd feed): one `knowledge_sources` row per item, `kind:
   "notion"`, `rawText: item.text`, `notionDatabaseId: dataSourceId`, `notionPageId: item.id`, via
   `.onConflictDoNothing({target: notionPageId}).returning()` — a page already imported in an
   earlier call is silently skipped, not duplicated
4. Return `{ created: number }` — count of rows actually inserted (post-dedupe, post-cap), not the
   full row list

No sync-marking, no PA-tag filter — those stay biz-education-distiller-specific concerns tied to
its own workflow; this endpoint is a generic bulk importer for any Notion database the learner
points it at, just with its own dedupe key and row cap instead of biz-education's `MAX_ROWS=20`
PA-tag-filtered sync.

## Files to touch
- `apps/api/src/db/schema.ts` — add `notionDatabaseId` column to `knowledgeSources`
- `apps/api/src/db/migrations/` — new migration
- `apps/api/src/knowledge-source/knowledge-source.repo.ts` — add `insertKnowledgeSourcesFromNotion(items, dataSourceId)` (bulk insert)
- `apps/api/src/knowledge-source/notion-knowledge-source.controller.ts` — new, parses `dataSourceId`, calls Notion, bulk-inserts
- `apps/api/src/router-table.ts`, `router.ts`, `server.ts` — wire `POST /knowledge-sources/notion`
- Unit tests co-located, mocking `getNotionClient`/`collectAllDataSourceRows` the same way `biz-education.client.test.ts` does

## Non-goals
- No PA-tag filtering, no "already synced" sync-marking flow — those stay biz-education-only
- No bit-detection/tagging/embedding of the imported rows yet — later items
- No UI for entering a Notion database ID — backend endpoint only

## Rollback
Additive only: two new nullable columns (one unique-indexed), one new route, one new controller
file. No existing table, route, or the biz-education pipeline's own files are touched.
