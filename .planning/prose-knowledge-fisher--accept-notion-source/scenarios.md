# Scenarios

- [x] Given a Notion data source ID with 3 rows, POST /knowledge-sources/notion creates 3 knowledge_sources rows with kind:"notion", the row's text, and notionDatabaseId set, returning `{created: 3}`
- [x] A Notion database with 0 matching rows returns `{created: 0}`, no rows inserted
- [x] The migration applies cleanly against a real local Postgres and notionDatabaseId's/notionPageId's column shapes match schema.ts
- [x] Re-importing the same database skips a page already imported earlier (notionPageId dedupe), instead of duplicating it
- [x] A single import caps at 500 rows even when the Notion database has more
- [x] A bad/inaccessible dataSourceId returns 400 invalid_notion_source, not a 500, and inserts nothing

## Files by scenario

| Scenario | Files |
|---|---|
| Bulk-create from Notion rows | notion-knowledge-source.controller.ts, knowledge-source.repo.ts, schema.ts, migration |
| Zero-row database | notion-knowledge-source.controller.ts |
| Migration applies cleanly | migration file, migrations.integration.test.ts |
| Dedupe on re-import | knowledge-source.repo.ts, schema.ts (notionPageId unique index), migrations.integration.test.ts |
| Row cap | knowledge-source.repo.ts |
| Notion-fetch error maps to 400 | notion-knowledge-source.controller.ts |
