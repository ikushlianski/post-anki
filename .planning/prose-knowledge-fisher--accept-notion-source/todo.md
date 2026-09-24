# Local todo — accept-notion-source

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
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
