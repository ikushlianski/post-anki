# Scenarios

- [x] Given a Notion data source ID with 3 rows, POST /knowledge-sources/notion creates 3 knowledge_sources rows with kind:"notion", the row's text, and notionDatabaseId set, returning `{created: 3}`
- [x] A Notion database with 0 matching rows returns `{created: 0}`, no rows inserted
- [x] The migration applies cleanly against a real local Postgres and notionDatabaseId's/notionPageId's column shapes match schema.ts
- [x] Re-importing the same database skips a page already imported earlier (notionPageId dedupe), instead of duplicating it, even under concurrent/racing imports
- [x] Reading stops at the 500-row cap instead of crawling the whole database first; the response reports truncated: true when the cap was hit
- [x] A bad/inaccessible dataSourceId returns 400 invalid_notion_source, not a 500, and inserts nothing
- [x] A real Notion error that isn't about a bad id (rate limit, outage, misconfigured client) re-throws to a logged 500, not a 400

## Files by scenario

| Scenario | Files |
|---|---|
| Bulk-create from Notion rows | notion-knowledge-source.controller.ts, knowledge-source.repo.ts, schema.ts, migration |
| Zero-row database | notion-knowledge-source.controller.ts |
| Migration applies cleanly | migration file, migrations.integration.test.ts |
| Dedupe on re-import, incl. races | knowledge-source.repo.ts, schema.ts (notionPageId unique index), migrations.integration.test.ts |
| Row cap + truncation reporting | notion-knowledge-source.controller.ts, knowledge-source.repo.ts |
| Bad-id Notion error maps to 400 | notion-knowledge-source.controller.ts |
| Non-bad-id Notion error re-throws to 500 | notion-knowledge-source.controller.ts |
