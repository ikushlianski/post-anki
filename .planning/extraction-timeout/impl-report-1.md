## Extraction chunk timeout with cheapest-model fallback

### What was done

Added `CHUNK_TIMEOUT_MS = 30_000` constant and per-call timeout logic to `writeAndValidate` in `detect-knowledge-bits.orchestrator.ts`. Each first `writeItems` call now runs behind a 30 s `AbortController`; on signal abort the orchestrator logs `extraction_chunk_timeout`, picks `cheapestKnowledgeItemModelId()` (or keeps the current model if it is already cheapest), logs `extraction_chunk_timeout_fallback`, and retries with a fresh 90 s controller. If the fallback also aborts or throws, the error re-throws so `mapWithConcurrency` routes the chunk into the existing failure path (which calls `markFailed`). The validation-retry `writeItems` call also received its own 30 s controller. `processChunk` now passes `source.id` to `writeAndValidate` as the optional fourth argument so warn logs include `knowledgeSourceId`.

### Files changed

- `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.ts` — added constant, `callWithTimeout` helper, timeout/fallback logic in `writeAndValidate`, updated `processChunk` call.
- `apps/api/src/knowledge-bit/detect-knowledge-bits.orchestrator.test.ts` — added `writeAndValidate timeout` describe with 3 tests (fallback model used + succeeds; same model kept when already cheapest; both timeouts → markFailed). Updated 6 existing assertions from exact-object to `expect.objectContaining` because `abortSignal` is now always present in the call options.

### Checks

- `npx tsc --noEmit` on `apps/api` and `packages/shared`: no errors.
- No eslint config found in the repo — lint step skipped (no lint script exists).
- `npx vitest run` on the orchestrator test file: 31/31 passed.

### Defaults taken

`cheapestKnowledgeItemModelId()` is called without a `now` argument so it uses wall-clock time, matching the existing pattern elsewhere in the file.

END-OF-REPORT
