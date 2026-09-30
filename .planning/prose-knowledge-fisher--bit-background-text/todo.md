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
- [ ] Add nullable `background` column to `knowledgeBits`, generate + run migration
- [ ] Extend detector's result schema and `runKnowledgeBitDetector` to carry `{text, background}` per bit
- [ ] Thread the new bit shape through `DetectKnowledgeBitsDeps`/`detect-knowledge-bits.orchestrator.ts`
- [ ] Persist `background` in `insertKnowledgeBits`/`insertKnowledgeBitsAndMarkDetected`
- [ ] Expose `background` in `listNextQuestionVariantsToAnswer` and its row type
- [ ] Co-located vitest tests for every scenarios.md line, then `npx tsc --noEmit` and lint at zero issues

## Manual steps
None.

## Post-deploy checks
None — additive, read-only field with no UI consumer yet.

## Resolved
None yet.
