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

## Single piece: `GET /knowledge-bits/:id`

- Returns the full version of one approved piece: text, context or example, every active phrasing (card type label, prompt, own answer, fill-in-the-blank sentence) in list order, subject path, tags, source (type, label, link, added-by, added date) and review state (state, next due date, times forgotten, review count).
- Subject path is computed on the server from the subject tree, top-level name first, and stops safely on a loop or a missing parent. Tags are sorted by name.
- The due date is null for new and suspended pieces.
- Unknown, unapproved or phrasing-less ids answer 404 `not_found`. The read is free and never writes.
- It is registered after every fixed `GET /knowledge-bits/*` route so `overview`, `browser`, `export` and the others keep resolving; the router test guards the order.

## Detail slide-over

- A plain click on a row opens a read-only slide-over with the piece's full version; it never changes the selection. Selecting is by the row checkbox, shift-click (range) and command or control click (toggle one). Clicks on a link, button, input or label inside a row do nothing to the panel.
- The panel loads its piece with the single-piece read, keyed by id, and refetches whenever browser data is invalidated. When the row is in the loaded list its text paints first; otherwise the panel waits for the read. A 404 shows "no longer exists"; a failed read shows an error with Retry and keeps the row text.
- The open piece lives in the page address as `open`. It is not a filter: it is not counted, not shown as a chip, and is carried through filter, subject, meaning search and Clear all changes. Opening from a closed panel adds a history entry, switching pieces and closing replace it, and closing removes the field.
- The panel renders from its own read, so list refetches, Load more, filters and meaning search cannot close or blank it.
- Escape closes the panel before it clears a selection (the panel listens in the capture phase and marks the event handled). The Delete key is ignored while the panel is open, except inside text fields.

## Operating rules

- Stored pieces do not record their embedding model; changing `EMBEDDING_MODEL` without re-embedding makes rankings meaningless.
- The production database needs pgvector and the pending migrations before this API ships; until pieces are back-filled, meaning search reports them as not ready.
