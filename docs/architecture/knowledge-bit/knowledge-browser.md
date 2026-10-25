# Knowledge browser

The knowledge browser lists approved pieces with filters, a total count and paging, and can rank them by meaning. Two separate reads serve it: a free list and a paid meaning search.

## Free list: `GET /knowledge-bits/browser`

- Query: `subjectId` (a subject id or `none` for unfiled), `limit`, `offset`, plus the shared filters `question`, `answer`, `origins`, `addedBy`, `link`, `site`, `from`, `to`, `states`. The page address and the API read the same lenient parser in `packages/shared/src/knowledge-bit-browser-filters.ts`; unknown values are dropped one by one. A reversed date range answers 400 `invalid_date_range`.
- Every filter runs in one database query, so filters compose with paging. Source type and added-by are computed in SQL by one shared rule used for both display and filtering.
- Response: `{ items, hasMore, total }`; each item carries `sourcePieceCount`, the number of pieces the source delete would remove.
- It never reaches the embedding service.

## Paid meaning search: `GET /knowledge-bits/browser/matches`

- Query: `q` (trimmed, 1 to 300 characters) plus `subjectId` and the same filters as the list. No paging.
- Response: `{ items, readyCount, notReadyCount, capped }`. Items are list items plus `similarity` (0 to 1), closest first, ties by id. Only pieces with closeness of at least 0.3 are kept, at most 100; `capped` is true when more were close enough.
- Filters apply first, then ranking runs in the database over `knowledge_bits.embedding_vec` (cosine, HNSW, widened candidate pool). Pieces without meaning data are never embedded by this read; they are counted in `notReadyCount`.
- When `readyCount` is 0 the paid call is skipped and `items` is empty.
- The typed words are embedded once with the `EMBEDDING_MODEL` setting. The result is kept in server memory for one hour (up to 500 entries) under the normalized words and the model, so repeats cost nothing.
- Only new words count toward the limit of 20 per rolling minute per server; beyond it the answer is 429 `search_rate_limited` before any paid call.
- Refusals: 429 `llm_budget_exceeded` (existing daily spend guard), 429 `search_rate_limited`, 502 `embedding_failed` (after the client's own retry and timeout), 400 `invalid_input`, 400 `invalid_date_range`.

## Operating rules

- Stored pieces do not record their embedding model; changing `EMBEDDING_MODEL` without re-embedding makes rankings meaningless.
- The production database needs pgvector and the pending migrations before this API ships; until pieces are back-filled, meaning search reports them as not ready.
