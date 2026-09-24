# Local todo — accept-notion-source

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [ ] Make the concurrent-dedupe migration test call the repo's own insert, not raw SQL
- [ ] Add a test pinning Unauthorized to a 500, not 400
- [ ] Rewrite the truncation test to use multiple pages and assert the query call count
- [ ] Validate dataSourceId shape before calling Notion so malformed ids get a clean 400
- [ ] Remove Unauthorized from the bad-dataSourceId allowlist, it masks token failures as 400
- [ ] Let a caller resume past the 500-row cap instead of re-reading the same oldest rows forever
- [x] Add a test proving a real Notion API error maps to 500, not 400
- [x] Only map real bad-dataSourceId Notion errors to 400, let genuine outages/bugs surface as 500
- [x] Tell the caller when an import was truncated at the row cap, not silently drop rows
- [x] Stop unbounded Notion database reads before the 500-row cap is applied
- [x] Return 400, not 500, when the Notion data source id is invalid
- [x] Cap a single Notion import at 500 rows
- [x] Dedupe re-imported Notion pages via a unique notionPageId column
- [x] Add `notionDatabaseId` column to `knowledgeSources` in schema.ts
- [x] Generate and apply migration
- [x] Add `insertKnowledgeSourcesFromNotion` to knowledge-source.repo.ts
- [x] Add notion-knowledge-source.controller.ts
- [x] Wire route: router-table.ts, router.ts, server.ts
- [x] Add unit tests (controller + repo), mocking the Notion client like biz-education.client.test.ts does
- [x] Add router.test.ts coverage for the new route
- [x] Add real-Postgres migration-shape test to migrations.integration.test.ts

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed.

## Resolved
- None yet.
