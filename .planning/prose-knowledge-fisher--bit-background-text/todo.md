---
type: todo
task: bit-background-text
tier: Guarded
updated: 2026-09-30
---

## Decisions to make
Nothing open — see plan.md's "Decisions made autonomously".

## To review/clarify
Nothing open.

## Coding tasks
Nothing open — all 4 phases done.

## Manual steps
None.

## Post-deploy checks
None — additive, read-only field with no UI consumer yet.

## Resolved
- Phase 1 (schema/migration) done — nullable `background` column, review-factory PASS/PASS.
- Phase 2 (detector schema and orchestrator wiring) done — `{text, background}` bit shape through detector and `DetectKnowledgeBitsDeps`; review round 1 FAIL fixed a `.nullable().optional()` schema bug (breaks Mastra strict structured output); round 2 FAIL fixed a missing 20/21-bit boundary test; round 3 PASS/PASS.
- Phase 3 (repo persistence and next-batch exposure) done — `background` persisted and selected through the repo layer; review round 1 FAIL fixed missing non-null-value and route tests; round 2 FAIL fixed missing real-Postgres retrieval test; round 3 PASS/PASS.
- Phase 4 (tests) done — confirmed all 9 scenarios.md lines genuinely covered; review round 1 FAIL fixed two missing null-read-back assertions (retrieval, migration column_default); round 2 PASS/PASS. Unit complete.
