# Local todo — detect-knowledge-bits

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [ ] Add `failureReason` to `knowledgeSources`, add `knowledgeBits` table + unique index in schema.ts
- [ ] Generate and apply migration
- [ ] Add knowledge-bit.repo.ts: insertKnowledgeBits, claimPendingKnowledgeSources, markKnowledgeSourceFailed, markKnowledgeSourceBitsDetected
- [ ] Add knowledge-bit-detector.agent.ts (cheap-tier LLM call, structured output, injection-guard delimiters)
- [ ] Add detect-knowledge-bits.orchestrator.ts (batch scan, atomic claim, length guard, provider-error handling)
- [ ] Add detect-knowledge-bits.controller.ts for POST /knowledge-sources/detect-bits
- [ ] Wire route: router-table.ts, router.ts, server.ts
- [ ] Add .max(50000) to the pasted-prose text field in knowledge-source.controller.ts
- [ ] Add unit tests for repo, agent, orchestrator, controller
- [ ] Add router.test.ts coverage for the new route
- [ ] Add real-Postgres tests: migration shape, atomic claim under concurrency, idempotent bit insert — via the real repo functions, not raw SQL

## Manual steps
- None.

## Post-deploy checks
- None — additive schema change, no backfill needed.

## Resolved
- None yet.
