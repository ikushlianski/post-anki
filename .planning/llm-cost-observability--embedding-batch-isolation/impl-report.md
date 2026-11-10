# Impl report: embedding batch isolation

## Files changed
- apps/api/src/shared/embeddings-client.ts
- apps/api/src/shared/embeddings-client.test.ts
No caller changed.

## Behavior
- Each input is sliced to MAX_EMBEDDING_INPUT_CHARS = 8000 (exported) before sending. Rationale: the model limit is 8191 tokens; 8000 chars stays under it even at a worst case of ~1 token per character (Cyrillic). Callers still hash the full text.
- A non-transient 4xx (not 429) now surfaces as a typed error with its status (wrapped in AbortError, so no retry as before). For batches of 2+ items, embedTexts then tries each item once alone and returns only successes. Each skipped item is logged (embeddings_client_item_skipped, id + provider message) and recorded as a failed call event ("item <id>: <message>"); one success event with summed usage covers the rest.
- All items rejected: throws the original batch error. 5xx/429/timeouts: unchanged (pRetry, 2 retries, single throw, no splitting). Single-item batches: unchanged.

## Callers checked
knowledge-bit, question-variant, cards, facts orchestrators iterate the returned results and look rows up by result.id; subject-duplicate wrapper passes through. None assumes one result per input. Minor: embeddedCount in knowledge-bit and facts orchestrators still reports toEmbed.length (may overcount skipped items); left unchanged as out of scope.

## Tests
- `npx vitest run src/shared/embeddings-client.test.ts` (from apps/api): 10 passed, 0 failed (4 new: cap, partial success, all-rejected throws, 5xx not split with 3 attempts).
- `npx tsc --noEmit -p apps/api`: no errors outside src/mcp (mcp errors belong to the other agent).

## Defaults chosen
- 401 and 403 do not trigger per-item fallback (auth problems are not item-specific, and splitting would waste up to N paid calls); every other non-429 4xx does.
- Per-item retries are sequential, one attempt each, no pRetry.

## Undone
Nothing. Not committed or staged.
END-OF-REPORT
