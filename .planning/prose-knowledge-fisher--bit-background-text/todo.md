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
- [ ] No real-Postgres test covers listNextQuestionVariantsToAnswer's background select/groupBy.
- [ ] Add a GET-route test proving next-batch JSON response includes background
- [ ] No test proves a non-null background round-trips through insert/select (all fixtures use null)
- [ ] Persist `background` in `insertKnowledgeBits`/`insertKnowledgeBitsAndMarkDetected`
- [ ] Expose `background` in `listNextQuestionVariantsToAnswer` and its row type
- [ ] Co-located vitest tests for every scenarios.md line, then `npx tsc --noEmit` and lint at zero issues

## Manual steps
None.

## Post-deploy checks
None — additive, read-only field with no UI consumer yet.

## Resolved
- Phase 1 (schema/migration) done — nullable `background` column, review-factory PASS/PASS.
- Phase 2 (detector schema and orchestrator wiring) done — `{text, background}` bit shape through detector and `DetectKnowledgeBitsDeps`; review round 1 FAIL fixed a `.nullable().optional()` schema bug (breaks Mastra strict structured output); round 2 FAIL fixed a missing 20/21-bit boundary test; round 3 PASS/PASS.
