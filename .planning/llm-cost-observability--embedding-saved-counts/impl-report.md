# Implementation report

## Files changed
- apps/api/src/{knowledge-bit/knowledge-bit-embedding,knowledge-bit/knowledge-bit-question-variant-embedding,facts/facts-embedding,cards/cards-embedding}.orchestrator.ts: embeddedCount = rows actually written; skippedCount added only when > 0.
- apps/api/src/{subject-duplicate/subject-duplicate,source-duplicate/source-duplicate}.orchestrator.ts: embeddedCount = results returned; skippedCount when > 0; span output includes skippedCount.
- packages/shared/src/{cards,subject-duplicate,source-duplicate}.ts: optional `skippedCount` (nonnegative int) added to the scan result schemas (EmbeddingScanCounts is shared by cards/facts/kb/variants; notion consumer only mocks it, unaffected).
- Tests: updated knowledge-bit-embedding and question-variant-embedding tests; new facts-embedding.orchestrator.test.ts and cards-embedding.orchestrator.test.ts.

## Tests
`npx vitest run` (apps/api) on 5 files (4 orchestrator tests + detect-knowledge-bits.controller.test.ts): 5 files, 48 tests passed.

## tsc
apps/api, packages/shared, apps/web: zero errors.

## Defaults / undone
- skippedCount is optional and omitted when 0, so existing exact-equality assertions and consumers are unchanged.
- No new unit test for subject/source duplicate orchestrators (only fetch-backed integration tests exist; not run). Web panel not changed.
- Nothing staged or committed.

END-OF-REPORT
