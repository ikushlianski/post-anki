# Review: embedding batch isolation

Verdict: PASS

## Findings (Critical/High only)

None.

## Checks performed

- Cap: 8000 chars per input, applied before send (apps/api/src/shared/embeddings-client.ts:217). Bounds English and Cyrillic under 8191 tokens; exotic scripts could exceed it but the per-item fallback absorbs that (not High).
- Callers hash full text, not the capped text (facts, knowledge-bit, question-variant, cards, subject-duplicate orchestrators), so no re-embed loop. They iterate returned ids only; subject-duplicate falls back to the cached row embedding for missing ids.
- Fallback only for multi-item batches and non-transient 4xx (not 401/403; 429 and 5xx are not AbortError): apps/api/src/shared/embeddings-client.ts:240. All-fail rethrows the batch error (:187); 5xx throws unchanged.
- Retry budget unchanged (RETRIES = 2); the single-item fallback calls the endpoint once with no retry.
- Cost: with capped text, a permanently rejected item costs one failed batch plus one call per still-unsaved item per scan, since successes are saved; negligible for few bad items. Not Critical/High.
- cards-retrieval single-query path has length 1, so it bypasses fallback and still throws on failure.
- Call events: per-item failures and a final success event are recorded; the all-fail path throws without a batch-level event (acceptable).
- Tests: `npx vitest run src/shared/embeddings-client.test.ts` passes, 10 of 10.

Satisfied: apps/api/src/shared/embeddings-client.ts:240

END-OF-REPORT
