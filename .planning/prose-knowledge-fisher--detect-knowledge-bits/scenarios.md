# Scenarios

- [ ] A pending prose source with 3 natural knowledge bits produces 3 `knowledge_bits` rows, source status becomes `bits_detected`
- [ ] A source with 0 detected bits (LLM returns an empty-safe minimum of 1, but if genuinely nothing extractable) still resolves to a terminal status, never stuck in `pending`/`processing`
- [ ] Re-running detect-bits on an already-`bits_detected` source is a no-op (only `pending` rows are selected)
- [ ] Two concurrent scan runs never both claim the same source (atomic per-row claim proved against real Postgres, not a raw-SQL simulation — the actual `claimPendingKnowledgeSources` repo function)
- [ ] Re-detecting the same source twice (e.g. after a bug fix + manual status reset) never duplicates bits — idempotent insert on (knowledgeSourceId, ordinal), proved against real Postgres via the real repo function
- [ ] A source longer than 50,000 chars is marked `failed` / `source_too_long` without ever calling the LLM
- [ ] A provider error (rate limit, timeout, bad structured output) marks the source `failed` with a reason, never leaves it stuck in `processing`
- [ ] The pasted-prose POST rejects text over 50,000 chars with 400, before it ever reaches the scan
- [ ] The migration applies cleanly against real Postgres; `knowledgeSources.failureReason` and `knowledgeBits`'s columns/unique-index match schema.ts

## Files by scenario

| Scenario | Files |
|---|---|
| Bits created from a source | knowledge-bit-detector.agent.ts, detect-knowledge-bits.orchestrator.ts, knowledge-bit.repo.ts |
| Empty-bit-safe terminal status | detect-knowledge-bits.orchestrator.ts |
| Only pending sources selected | knowledge-bit.repo.ts |
| Atomic claim under concurrency | knowledge-bit.repo.ts, migrations.integration.test.ts |
| Idempotent re-detection | knowledge-bit.repo.ts, migrations.integration.test.ts |
| Oversized source fails fast, no LLM call | detect-knowledge-bits.orchestrator.ts |
| Provider error → failed, not stuck | detect-knowledge-bits.orchestrator.ts |
| Prose POST length cap | knowledge-source.controller.ts |
| Migration shape | migration file, migrations.integration.test.ts |
