---
type: spec
branch: learn-from-doc-site
task: Rich filters, column controls and search by meaning in the knowledge browser
complexity: complex
state: confirmed
updated: 2026-10-25
---
# Spec: Rich filters, column controls and search by meaning in the knowledge browser

### Summary
The knowledge browser gets one always-visible toolbar. It holds meaning search, the subject control, a Filters panel, a Columns menu, active-filter chips with "Clear all", and the existing selection count with Delete and Clear. Every column gets its own filter: Question text, Answer text, Source, Added by, Source URL and Date added, plus study state. Each filter can be set from the column header or the Filters panel, works with paging, shows a total count, and lives in the page address. Columns can be shown or hidden per browser. "Search knowledge" ranks pieces by meaning with one paid embedding call per new search. It never pays to embed stored pieces while browsing, and it says how many pieces it could not search yet.

### The ask
Owner: "support rich filters in the knowledge browser".

Owner addition 1, verbatim from the coordinator: "(1) a 'filter by subject' control (including unfiled and sub-subjects if the subject tree supports it). (2) a 'search knowledge' box where the owner types a question or sentence and the browser returns the most similar knowledge bits by VECTOR search, not text matching." Keep text search as an ordinary cheap filter alongside, and say plainly which of the two the box uses.

Owner addition 2, verbatim from the coordinator: "(1) Column customization: the owner can show or hide each column (Question, Answer, Source, Source URL, Added by, Date added) from a columns menu; choice persists per browser like the existing saved column order; a hidden column's filter should still be usable or clearly shown as an active filter chip; keep a reset. (2) Per-column filters: every column gets its own filter (text contains for Question/Answer, multi-select for Source and Added by, domain/has-URL for Source URL, date range for Date added), reachable from the column header or the filter UI. (3) Placement: the owner wants the filters in the SAME always-visible bar as the 'N selected' action bar, i.e. one toolbar row/panel holding: filters, active-filter chips with clear-all, columns menu, subject filter, the 'search knowledge' vector box, then the selection count and Delete/Clear. Design that single toolbar (layout at phone width too, what wraps, what collapses into a 'Filters' popover), and say how selection behaves when filters change."

The coordinator's brief also asks for: server-side filtering that composes with paging, sorting, selection and "select all from this source"; address-bar state; match count; empty state; indexes; word search without new dependencies; tests; and, for meaning search, where vectors live, missing vectors, per-search cost and limits, composition with filters and paging, threshold, score display, index type, and the production database steps.

### Which search does what
- **Question and Answer column filters** do plain letter matching (case-insensitive contains). Free.
- **"Search knowledge"** is meaning search by vector closeness. One paid embedding call per new set of words, then ranking inside the database.

### Facts (from code and the local database)
- The browser list runs server-side with `limit`/`offset` and already accepts `subjectId`, including `none` for unfiled and the whole sub-subject tree: `apps/api/src/knowledge-bit/knowledge-bit-browser.repo.ts:45-84`, `packages/shared/src/knowledge-bit-browser.ts:4-10`.
- A piece's subject is the topic's curriculum subject, else its source's subject: `apps/api/src/knowledge-bit/knowledge-bit-subject.ts:5-7`.
- Source type is derived in TypeScript after the query: `apps/api/src/knowledge-bit/knowledge-bit-browser-origin.ts:10-20`. "Added by" is purely a function of source type: `apps/web/src/knowledge-bit/knowledge-browser-columns.tsx:34-36`.
- The Question cell shows every live phrasing; the Answer is the preferred variant's answer: `knowledge-bit-browser.repo.ts:113-124`.
- Rows are always newest first, ties by id. There is no row sorting; the header grip only reorders columns: `knowledge-bit-browser.repo.ts:82`, `apps/web/src/knowledge-bit/knowledge-browser-sortable-header.tsx:29-41`.
- Column order is saved per browser in local storage under `knowledge-browser-columns:v1:<tableId>`, as an id list: `apps/web/src/knowledge-bit/column-order-storage.ts:1-40`, `use-knowledge-browser-column-order.ts:8-28`.
- The selected-count bar is one sticky row holding the count, Delete, the source actions and Clear selection, with an inline delete confirmation: `apps/web/src/knowledge-bit/knowledge-browser-action-bar.tsx:11-101`. The delete-source confirmation is a second sticky bar: `knowledge-browser-source-bar.tsx:4-47`.
- The selection is cut down to visible rows whenever the loaded row list changes, silently today: `use-knowledge-browser-selection-delete.ts:33-35`, `knowledge-browser-selection.ts:62-77`. The cap is 500: `packages/shared/src/knowledge-cleanup.ts:3`.
- The delete-source count is the number of loaded rows from that source, not the source's real size: `use-knowledge-browser-source-delete.ts:19`.
- Popovers in this app are hand-built with component state; there is no popover library: `apps/web/src/open-questions/capture-question-button.tsx:28-90`, `apps/web/package.json`.
- Case-insensitive word matching with escaped wildcards over live phrasings exists for the study overview: `knowledge-bit-overview.repo.ts:28-40`; the web debounces 250 ms: `use-knowledge-overview-data.ts:10-25`.
- Study-state rules exist: `knowledge-bit-overview-state.ts:11-28`; schedule table `apps/api/src/db/schema.ts:1312-1324`.
- Meaning data for pieces lives in `knowledge_bits.embedding_vec`, a `halfvec(1536)`, with an HNSW cosine index `knowledge_bits_embedding_vec_hnsw_idx`: `schema.ts:20,1181,1249-1252`, migrations `0106_enable-pgvector.sql`, `0107`, `0109_halfvec-embeddings.sql`. The embedded text is the piece body (`front\nback` for typed-in pieces): `knowledge-bit-approval-embedding.orchestrator.ts:53-60`, `knowledge-bit-manual-item.repo.ts:31`.
- The model is the `EMBEDDING_MODEL` setting, default `openai/text-embedding-3-small`, via OpenRouter: `apps/api/src/shared/env.ts:10`, `embeddings-client.ts:79`. Stored rows do not record their model.
- Pieces are embedded on approval, best-effort: `knowledge-bit-approval-embedding.orchestrator.ts:49-86`. A manual scan route exists: `detect-knowledge-bits.controller.ts:39`.
- A closeness query under a subject filter exists and widens the index candidate pool when filtered: `knowledge-bit-embedding.repo.ts:104-140`, `apps/api/src/db/vector-search.ts:4-16`. Minimum closeness used by the chats: 0.3, `packages/core/src/cards/rank-by-similarity.ts:4`.
- Card search skips the paid call when nothing is embedded: `cards-retrieval.orchestrator.ts:51-57`.
- Every embedding call checks and records the daily spend limit and logs a call event: `embeddings-client.ts:120,213-221`. A reached limit becomes HTTP 429 `llm_budget_exceeded` on every route: `apps/api/src/api-server.ts:492-497`. Price estimate $0.02 per million tokens: `spend-guard.ts:28`. No HTTP rate limiter exists in the API (grep over `apps/api/src`).
- Local dev database (read-only query, 2026-10-25): pgvector 0.8.7; 3 approved pieces, 0 with `embedding_vec`.
- Production Neon has none of migrations 0104-0112, so no pgvector and no `embedding_vec` there: `.planning/.runs/2026-10-25/vectorization-session/handoff.md`.
- Iterative index scans (`hnsw.iterative_scan`) need pgvector 0.8.0 or newer; Neon's version is not confirmed: [Nile pgvector 0.8.0](https://www.thenile.dev/blog/pgvector-080), [AWS pgvector 0.8.0](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql).
- Browser e2e specs live in a separate verification repository: `e2e/README.md:1-17`. Mock embeddings exist for `LLM_MODE=mock`: `scripts/lib/mock-llm.mjs`, `env.ts:97`.

### Assumptions
- The collection stays in the hundreds to low thousands of pieces for the next year (`.planning/vector-search/report.md` section 3). At that size letter matching without a special index, and filtered closeness ranking, both run in tens of milliseconds.
- One search query is 10-40 tokens, about $0.0000008 and 200-600 ms per paid call.
- The API runs as one process, so an in-memory reuse cache and rate limit suffice; with several processes each keeps its own and the daily spend limit still applies.

### To verify
- Neon's pgvector version and whether `CREATE EXTENSION vector` succeeds under the owner's role (owner step).
- Whether the verification repo's mock OpenRouter answers `/embeddings` (first task of the e2e aspect).

### Toolbar design
- One sticky panel replaces today's action bar and source bar. Line 1, left to right: "Search knowledge" box (grows), Subject control, "Filters (n)" button, "Columns" button, a spacer, then the selection group ("N selected", Delete, the source actions when one source is selected, Clear). Line 2 appears only when a filter is set: "N matching pieces", one chip per active filter (click removes it), and "Clear all".
- Confirmations (delete selected, delete whole source) and notes (meaning-search status, "unselected because hidden") render as an extra line inside the same panel.
- Width under 640 px: the search box takes line 1; Subject, Filters and Columns share line 2 as compact buttons; the selection group wraps to line 3; chips stay on one sideways-scrolling line. Every per-column filter lives in the Filters panel, which opens as a full-width sheet under the toolbar on a phone and as a dropdown on wide screens.
- Column headers get a small filter button beside the grip; it opens the same per-column editor the Filters panel uses, anchored under the header, and shows a dot when that column is filtered. The grip alone starts a drag.
- Popovers close on Escape and outside click, and return focus to their button, following the existing hand-built popover pattern.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| Browser filter parsing (shared, lenient) | raw address or query values | clean filter set, bad values dropped | SCENARIO 3, 4, 5, 7, 10 |
| Site normalising | typed site text | bare lowercase host without scheme, path or leading "www." | SCENARIO 4 |
| Filter-to-database conditions | clean filter set, subject tree | one combined database condition | SCENARIO 2-8, 15 |
| Source type and added-by in the database | manual flag, AI flag, source URL, source kind | source type, and "you" or "ai" from it | SCENARIO 3 |
| Study state in the database | schedule row or none, now | one of six states, overview rules | SCENARIO 7 |
| Local-day bounds | from/to calendar dates, owner's time zone | start and end instants | SCENARIO 5 |
| Active filters as chips, and clear-all | address values | ordered chip list with labels and removal targets; the address without filters | SCENARIO 8, 11 |
| Filters per column | clean filter set | which columns have an active filter | SCENARIO 8, 9 |
| Column layout | saved order, saved hidden set, defaults, a toggle | visible ordered columns; refuses hiding the last one | SCENARIO 9 |
| Unselected-by-filter count | selection before, visible ids after | how many selected pieces were dropped | SCENARIO 12 |
| Query-embedding reuse key | normalised words, model setting | cache key | SCENARIO 17 |
| Search rate limit | recent search times | allow or refuse | SCENARIO 16 |
| Match percentage | closeness score | whole percent | SCENARIO 14 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|---|---|---|---|
| SCENARIO 1 | None | toolbar, selection group (action bar), source confirm moved into toolbar, screen | None |
| SCENARIO 2 | filter conditions, shared text-match helper, shared filter schema | column filter editor, sortable header filter button | None |
| SCENARIO 3 | filter conditions (source type, added by), shared schema | column filter editor | None |
| SCENARIO 4 | filter conditions (link, site), shared site normaliser | column filter editor | None |
| SCENARIO 5 | filter conditions (date range), shared schema | column filter editor, local-day bounds | None |
| SCENARIO 6 | filter conditions (existing subject scope, moved) | subject picker, route search parsing | None |
| SCENARIO 7 | filter conditions (study state) | Filters panel | None |
| SCENARIO 8 | browser repo (total count), shared page schema | filter chips, data hook, header filter marker | None |
| SCENARIO 9 | None | columns menu, column layout hook and storage, table | None |
| SCENARIO 10 | shared lenient parser | browser route search parsing, filter address mapping | None |
| SCENARIO 11 | None | screen empty state, chips "Clear all" | None |
| SCENARIO 12 | None | selection hook (unselected note), toolbar | None |
| SCENARIO 13 | browser repo (source piece count), shared item schema | source delete hook, toolbar confirmation | None |
| SCENARIO 14 | meaning controller, orchestrator, repo, router entries | meaning search box, matches hook and API client, match percentage in the Question cell | None |
| SCENARIO 15 | meaning repo (filters, not-ready count) | meaning search status line | None |
| SCENARIO 16 | meaning orchestrator (rate limit, skip when none ready), existing budget refusal | meaning search messages | None |
| SCENARIO 17 | reuse cache in the meaning orchestrator | None | None |

### Files to create
```
packages/shared/src/
  knowledge-bit-browser-filters.ts              shared filter schema, lenient parser, site normaliser, comma lists
  knowledge-bit-browser-filters.test.ts
  knowledge-bit-browser-matches.ts              meaning query and response schemas, 100 cap
apps/api/src/knowledge-bit/
  knowledge-bit-text-match.ts                   word-match condition moved out of the overview repo, question/answer variants
  knowledge-bit-browser-filters.ts              filter set to one condition; source type, added-by, study state in SQL
  knowledge-bit-browser-filters.integration.test.ts
  knowledge-bit-browser-items.ts                row-to-item assembly shared by list and meaning reads
  knowledge-bit-browser-matches.repo.ts         filtered closeness ranking, not-ready count, any-ready check
  knowledge-bit-browser-matches.repo.integration.test.ts
  knowledge-bit-browser-matches.orchestrator.ts query check, rate limit, reuse cache, paid call, ranking
  knowledge-bit-browser-matches.orchestrator.test.ts
  knowledge-bit-browser-matches.controller.ts   GET /knowledge-bits/browser/matches (type-checked, no unit test)
apps/web/src/knowledge-bit/
  knowledge-browser-filters.ts                  address mapping, chips, per-column active flags, clear-all, local-day bounds
  knowledge-browser-filters.test.ts
  knowledge-browser-toolbar.tsx                 the single sticky panel and its responsive lines
  knowledge-browser-toolbar.test.tsx
  knowledge-browser-toolbar-popover.tsx         small anchored popover: Escape, outside click, focus return
  knowledge-browser-filter-panel.tsx            every filter incl. study state; sheet on phone
  knowledge-browser-column-filter.tsx           one column's filter editor, used by header and panel
  knowledge-browser-column-filter.test.tsx
  knowledge-browser-filter-chips.tsx            chips, matching count, Clear all
  knowledge-browser-columns-menu.tsx            show/hide checkboxes, Reset columns
  knowledge-browser-column-layout.ts            order + hidden set rules, last-column guard
  knowledge-browser-column-layout.test.ts
  knowledge-browser-subject-picker.tsx          All, No subject, indented subject tree
  knowledge-browser-meaning-search.tsx          search box (Enter or button), status and error lines
  knowledge-browser-meaning-search.test.tsx
  knowledge-browser-matches.api.ts              server function for the meaning read, error-code mapping
  use-knowledge-browser-matches.ts              meaning query, no automatic retry on refusals
apps/api/scripts/
  seed-knowledge-browser-demo.ts                local-only demo pieces for every filter, mock meaning data
docs/architecture/knowledge-bit/
  knowledge-browser.md                          current state: filter contract, toolbar, cheap list read vs paid meaning read
```

### Files to modify
```
packages/shared/src/knowledge-bit-browser.ts    query = paging + shared filters; page gains total; item gains sourcePieceCount and optional similarity
  used by: api browser repo/controller/origin, web browser api/table/columns/source files
  tests: packages/shared/src/knowledge-bit-browser.test.ts
packages/shared/src/index.ts                    export the two new shared files
apps/api/src/knowledge-bit/knowledge-bit-browser.repo.ts   filter conditions, total, source piece count; subject counts query unchanged
  used by: knowledge-bit-browser.controller.ts
  tests: knowledge-bit-browser.repo.integration.test.ts, knowledge-bit-browser.controller.test.ts
apps/api/src/knowledge-bit/knowledge-bit-browser-origin.ts removed; rules move to the SQL source-type expression
  used by: knowledge-bit-browser.repo.ts
  tests: knowledge-bit-browser-origin.test.ts (cases move to the filter integration test)
apps/api/src/knowledge-bit/knowledge-bit-browser.controller.ts   parse the extended query; 400 only for a reversed date range
  used by: api-server.ts
  tests: knowledge-bit-browser.controller.test.ts
apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts   import the moved word-match helper; behaviour unchanged
  used by: knowledge-bit-overview.controller.ts
  tests: knowledge-bit-overview.controller.test.ts, knowledge-bit-overview-delete.integration.test.ts
apps/api/src/router-table.ts, router.ts, api-server.ts   register GET /knowledge-bits/browser/matches; a few lines each
apps/web/src/routes/knowledge.browser.tsx       validateSearch through the shared lenient parser; keeps subject and view
apps/web/src/knowledge-bit/knowledge-browser-screen.tsx   mount toolbar, empty state, meaning mode; drop the old reset button
  used by: routes/knowledge.browser.tsx
  tests: knowledge-browser-screen.test.tsx
apps/web/src/knowledge-bit/knowledge-browser-action-bar.tsx   becomes the toolbar's selection group; no own sticky wrapper
  used by: knowledge-browser-screen.tsx
  tests: knowledge-browser-selection-delete.test.tsx
apps/web/src/knowledge-bit/knowledge-browser-source-bar.tsx   renders as a toolbar line; real count; hidden-pieces wording
  tests: knowledge-browser-source-delete.test.tsx
apps/web/src/knowledge-bit/use-knowledge-browser-source-delete.ts   count from sourcePieceCount
apps/web/src/knowledge-bit/use-knowledge-browser-selection-delete.ts   report how many were unselected by a filter change
  tests: knowledge-browser-selection-delete.test.tsx
apps/web/src/knowledge-bit/use-knowledge-browser-column-order.ts, column-order-storage.ts   also store the hidden set (new storage key version, old order still read)
  used by: knowledge-browser-screen.tsx
  tests: use-knowledge-browser-column-order.test.tsx, column-order-storage.test.ts
apps/web/src/knowledge-bit/knowledge-browser-sortable-header.tsx   filter button and active marker beside the grip
apps/web/src/knowledge-bit/knowledge-browser-table.tsx   render visible columns only; pass header filter props
  tests: knowledge-browser-table.test.tsx
apps/web/src/knowledge-bit/knowledge-browser-columns.tsx   match percentage in the Question cell when a score is present
apps/web/src/knowledge-bit/use-knowledge-browser-data.ts   rows hook takes the filter set, keeps previous rows while refetching; subject counts hook unchanged
  used by: screen, subject list, nav/sidebar-subjects.tsx
  tests: knowledge-browser-screen.test.tsx, knowledge-browser-subject-list.test.tsx, nav/sidebar-subjects.test.tsx
apps/web/src/knowledge-bit/knowledge-browser.api.ts   send filters in the query string
```

### Risk & rollout
- The subject list page and the sidebar read the same data hook file and the same `subject` address value; both must keep working unchanged.
- The overview's word search moves to a shared helper; its existing tests must pass unchanged.
- Saved column orders from before this change must still load; a new storage version that cannot read them would reset every owner's layout.
- Production needs the owner's database step first (`architecture.md` "Rollout"). The code already reads `embedding_vec`, so shipping before the pending migrations breaks the whole API. Failure modes: `architecture.md` "Failure modes".

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1-13 | 30-40 approved pieces across all five source types, three subjects with one sub-subject, a few unfiled, links on two sites incl. a subdomain, dates over three months, a mix of never-studied, learning, review, suspended and buried, some Russian text, one source with 8 pieces | establish new: `apps/api/scripts/seed-knowledge-browser-demo.ts`, local dev database only |
| SCENARIO 14-17 | most seeded pieces with meaning data, about 5 without; distinct topics so ranking is visible | same script, meaning data from `LLM_MODE=mock` deterministic vectors, zero cost |

### Documentation changes
- knowledge-bit domain: create `docs/architecture/knowledge-bit/knowledge-browser.md`.

### Decisions made autonomously
- Filtering runs in the database; the list is paged, so a browser-side filter would only see loaded rows.
- Filters: Question text, Answer text, Source, Added by, Source URL (link presence and site), Date added, subject, study state. Every column has one, as asked; subject and study state are not columns, so they live in the toolbar and the Filters panel.
- No separate any-text word box: the Question and Answer filters are the cheap text search, and a third text box beside meaning search would confuse which search is which.
- Added by is offered as asked even though it follows from source type. Both filters apply together, and an impossible pair shows the normal empty state.
- "Has more than one phrasing" filter cut as low value.
- Source type moves to one database expression used for display and filtering, so the rules cannot drift; the old TypeScript cases become integration-test cases.
- Subject always includes sub-subjects, as today; "No subject" keeps its `none` value.
- Question filter matches any live phrasing's prompt; Answer filter matches any live phrasing's answer. Case-insensitive contains with escaped wildcards, max 200 characters each, debounced 250 ms. No new extension or index. Trigram indexing pays off past about 50,000 pieces or a filtered page over 200 ms, and needs an extension on Neon. English full-text search is unsuitable because it matches whole English words, not substrings or Russian.
- Site matches the host exactly or as a subdomain, ignoring scheme, path and leading "www."; a site implies "has a link".
- Dates in the address are calendar days; the web turns them into local start and end instants, so the API stays time-zone free.
- Multi-value filters are comma lists in the address and the query string; unknown values are dropped one by one, never an error page.
- The address uses replace for typing and push for discrete choices, so back steps through choices, not keystrokes.
- Column visibility is per browser in local storage beside the order, not in the address: it is a personal layout, not a view to share. The last visible column cannot be hidden. "Reset columns" in the Columns menu restores both order and visibility and replaces today's separate reset button.
- A filter on a hidden column keeps applying, shows a chip, and stays editable in the Filters panel.
- Per-column filters open from a header filter button and from the Filters panel, through one shared editor, so both places behave the same.
- Popovers follow the app's hand-built pattern; no popover library is added.
- Selection on filter change keeps today's rule: it shrinks to rows still shown, so a delete never touches a hidden piece. The toolbar now says how many were unselected, which removes the silent drop. "Select all from this source" and shift ranges act on shown rows only.
- Each row carries its source's real piece count, so delete-source is honest under filters and paging.
- Total match count comes with every list page; cheap at this size, uniform shape.
- Meaning search is a separate read, `GET /knowledge-bits/browser/matches`, so the free list read can never reach the paid service (the `/cards/matches` precedent).
- Meaning search ranks `knowledge_bits.embedding_vec`, the same data the subject chat uses, with the same `EMBEDDING_MODEL` and client, so query and stored vectors come from one model.
- Filter first, then rank: one query applies every filter, keeps closeness of at least 0.3, orders by closeness then id, and returns at most 100 rows. There is no "Load more" in meaning mode; a note says when the cap was hit.
- With any filter set, the index candidate pool is widened through the existing helper. Iterative index scans (pgvector 0.8 or newer, to verify on Neon) are the upgrade if the collection grows large.
- Column text filters and meaning search can combine: filters narrow, meaning orders. Meaning mode orders by closeness, otherwise newest first; no sort controls.
- Match percentage is a whole number in the Question cell, only in meaning mode, so the saved column layout is untouched.
- Pieces without meaning data are excluded and counted; browsing never embeds them. When none in scope are ready, the paid call is skipped.
- Meaning search runs only on Enter or the button, max 300 characters; empty input leaves meaning mode.
- Recent query vectors are kept in server memory, keyed by normalised words plus the model setting, up to 200 entries, oldest dropped first.
- Up to 20 meaning searches per rolling minute per server, else 429 `search_rate_limited` before any paid call; cache hits do not count. The daily cap is the existing `LLM_DAILY_BUDGET_USD` guard. The web does not auto-retry 429s; an embedding failure (502 `embedding_failed`) offers a retry.
- No index or migration is added.
- E2E specs live in the verification repository as their own aspect.
- Tests follow value: derivers get unit tests in business language; the SQL filter and ranking rules get integration tests because the business rules live in those queries; the meaning orchestrator gets a test because it guards money ("no paid call when..."); the new controller is type-checked only.

### Implementation order
1. Shared filter parsing and site normalising: red-green-refactor, covers SCENARIO 3, 4, 5, 7, 10
2. Database filter conditions with source type, added-by and study state in SQL: integration-tested, covers SCENARIO 2-8
3. List read with total and source piece count, covers SCENARIO 8, 13
4. Meaning read: repo, orchestrator, controller, routes, covers SCENARIO 14-17
5. Web filter mapping, chips, local-day bounds, column layout rules: red-green-refactor, covers SCENARIO 5, 8, 9, 10, 11
6. Toolbar, Filters panel, column filters in headers, Columns menu, subject picker, selection note, honest source delete, covers SCENARIO 1-13
7. Meaning search box, status, match percentage, covers SCENARIO 14-16
8. Demo seed script, architecture doc, e2e specs in the verification repository

### Scope boundary
- Any-text word box beside the column text filters: replaced by the Question and Answer filters.
- "Has more than one phrasing" filter: low value.
- Row sorting by column: not asked.
- Saved or named views: the address already makes views shareable.
- Column visibility in the address or synced across devices: layout stays per browser, as asked.
- Phrasing-level meaning search or blended word-and-meaning ranking.
- Re-embedding or back-filling from the browser: stays with approval and the scan route, owner-approved.
- Trigram index, Russian full-text configuration, iterative index scans, a per-vector model record.
