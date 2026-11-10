# Review: extraction chunk timeout + model fallback

Reviewer: automated review agent
Date: 2026-10-13

## Verdict: APPROVED

## Findings

### (none blocking)

**Minor — silent timeout on validation-retry path (no test, no warning)**
When the second `writeItems` call (the quote/language retry, guarded by `ctrl2` / `timer2`) aborts due to timeout, the code in `writeAndValidate` falls into the outer `catch` block but emits no `log.warn`. If `firstResult.valid` is non-empty the error is swallowed; if empty it rethrows. Neither path logs `extraction_chunk_timeout`. Low impact (first-attempt data is preserved or the error surfaces through `markFailed`), but operators lose observability on a second-stage timeout. No test covers a `ctrl2` timeout scenario.

## Checklist

| Check | Result |
|---|---|
| AbortController not leaked | PASS — `clearTimeout` in all three `finally` blocks |
| Fallback skipped when already cheapest | PASS — `cheapest !== modelId ? cheapest : modelId` covers the `undefined` case too |
| Fallback timeout is 90 s | PASS — `CHUNK_TIMEOUT_MS * 3 = 90_000` |
| Double timeout rethrows → `markFailed` called | PASS — error flows through `mapWithConcurrency` rejected outcome |
| Tests cover: fallback model used | PASS |
| Tests cover: same model kept when cheapest | PASS |
| Tests cover: double timeout → `markFailed` | PASS |
| Fake timers used correctly | PASS — `useFakeTimers` before, `useRealTimers` after in all three timeout tests |
| `source.id` in warn logs | PASS — fourth arg to `writeAndValidate` sets `knowledgeSourceId` in `log.warn` |
| No `any` types | PASS |
| `npx tsc --noEmit` | PASS — no errors |
| `npx vitest run` on test file | PASS — 31/31 |

END-OF-REPORT
