# Local todo — accept-pasted-prose

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add router.test.ts coverage and a real-Postgres migration integration test for knowledge_sources
- [x] Add controller test for empty/whitespace text 400 and valid text 201 with trim
- [ ] Add `knowledgeSources` table to schema.ts
- [ ] Generate and apply migration
- [ ] Add `knowledge-source.repo.ts` with `insertKnowledgeSource`
- [ ] Add `knowledge-source.controller.ts` with validation (reject empty/whitespace text)
- [ ] Wire route: router-table.ts, router.ts, server.ts
- [ ] Add repo unit test

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed.

## Resolved
- None yet.
