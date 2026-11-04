

## filter-contract-api

### Scope
- Shared filter rules and the filtered, counted list read
- Out of scope: Meaning search and every screen change

### Goal
- Every browser filter runs in the database, composes with paging, and returns a total count.

### Criteria
- [x] Each filter narrows the list correctly in integration tests
- [x] All filters combine and paging never repeats or skips a piece
- [x] Every page reports the total number of matching pieces
- [x] Each row reports its source's real piece count
- [x] Source type shown and filtered follow one shared rule
- [x] Study overview word search behaves exactly as before

### Coding tasks
- [x] Define shared filter rules read by the page address and the API, ignoring bad values
- [x] Turn a typed website into a bare site name so subdomains and www match
- [x] Move the study overview's word matching into one shared helper, behaviour unchanged
- [x] Work out source type and who added a piece inside the database, replacing the after-the-fact rule
- [x] Apply question, answer, source, added-by, link, site, date, subject and study state filters in one database query
- [x] Return the total match count and each source's real piece count with every page
- [x] Refuse a reversed date range with a clear error and accept everything else leniently
- [x] Test each filter, their combination, paging and the counts against the local test database

### Notes
- Owns packages/shared/src/knowledge-bit-browser.ts, knowledge-bit-browser-filters.ts, index.ts exports
- Owns apps/api/src/knowledge-bit/knowledge-bit-browser{.repo,.controller,-filters,-items,-origin}.ts and knowledge-bit-text-match.ts
- Owns apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts import change and the co-located tests of all of these
- Depends on none
- Covers SCENARIO 2-8, 13; detail in spec.md Decisions; no migration or index

## meaning-search-api

### Scope
- The paid search-by-meaning read with its limits and reuse
- Out of scope: Embedding stored pieces from a browse request

### Goal
- Rank filtered pieces by meaning with one paid call per new search, inside clear limits.

### Criteria
- [x] Results are ranked by closeness and respect every filter
- [x] Pieces without meaning data are counted, never embedded
- [x] No paid call when nothing in scope is ready
- [x] Same words and model reuse the earlier paid result
- [x] Too many searches per minute are refused before paying
- [x] Spending limit and service failures return clear refusal codes

### Coding tasks
- [x] Define the shared shape of a meaning search request and its ranked, capped answer
- [x] Rank pieces by closeness under every browser filter, keeping only close matches, at most 100
- [x] Count filtered pieces that have no meaning data yet and report them alongside the results
- [x] Skip the paid call entirely when no filtered piece is ready for meaning search
- [x] Remember recent search words' meaning in memory so repeats with the same model cost nothing
- [x] Refuse more than 20 new searches a minute before paying, and report service failures clearly
- [x] Expose the meaning search as its own address, separate from the free list
- [x] Test ranking, filters, not-ready counts, reuse, limits and refusals with fixed fake vectors
- [x] Write the knowledge browser architecture page describing the free list and the paid meaning search

### Notes
- Owns packages/shared/src/knowledge-bit-browser-matches.ts and apps/api/src/knowledge-bit/knowledge-bit-browser-matches.*
- Owns route lines in apps/api/src/router-table.ts, router.ts, api-server.ts and docs/architecture/knowledge-bit/knowledge-browser.md
- Depends on filter-contract-api
- Owner step before production: enable pgvector on Neon and apply migrations 0104-0112; we cannot run it
- Owner decides whether to pay for back-filling meaning data of existing pieces after that
- Covers SCENARIO 14-17

## browser-toolbar-ui

### Scope
- The single toolbar, every column filter, chips, columns menu and subject control
- Out of scope: The meaning search box and its messages

### Goal
- One always-visible toolbar holds every filter, chips, columns menu, subject control and selection actions.

### Criteria
- [x] One sticky toolbar holds every control and the selection actions
- [x] Toolbar wraps cleanly at phone width with filters in a sheet
- [x] Every column filter opens from its header and the Filters panel
- [x] Active filters show as chips with a working Clear all
- [x] Columns can be hidden, remembered per browser, and reset
- [x] Filters survive reload and shared links; bad values are ignored
- [x] Filter changes unselect hidden rows and say how many
- [x] Delete whole source states the source's real piece count

### Coding tasks
- [x] Keep every filter in the page address so reloads and shared links reopen the same view
- [x] Turn chosen calendar days into the owner's local start and end of day
- [x] Build one sticky toolbar holding search slot, subject, Filters, Columns and the selection actions
- [x] Make the toolbar wrap onto three lines at phone width with filters opening as a sheet
- [x] Move the delete confirmations into the toolbar instead of a second bar
- [x] Build one filter editor per column, opened from the column header and from the Filters panel
- [x] Add study state to the Filters panel and a subject control with No subject to the toolbar
- [x] Show active filters as removable chips with the matching count and Clear all
- [x] Add a Columns menu to show or hide columns, remembered per browser, never hiding the last one
- [x] Make Reset columns restore order and visibility while older saved orders still load
- [x] Tell the owner how many selected pieces a filter change unselected
- [x] Use the source's real piece count in the delete-source confirmation and mention hidden pieces
- [x] Show a distinct nothing-matches message with Clear all, separate from the empty collection message
- [x] Test the filter mapping, column rules, toolbar, chips, selection note and source count
- [x] Mark a filtered column in its header and keep hidden columns' filters as chips

### Notes
- Owns apps/web/src/routes/knowledge.browser.tsx and apps/web/src/knowledge-bit/knowledge-browser-screen.tsx
- Owns knowledge-browser-{filters,toolbar,toolbar-popover,filter-panel,column-filter,filter-chips,columns-menu,column-layout,subject-picker} files
- Owns knowledge-browser-{action-bar,source-bar,sortable-header,table}.tsx, knowledge-browser.api.ts, column-order-storage.ts
- Owns use-knowledge-browser-{data,column-order,selection-delete,source-delete}.ts and every co-located test, all under apps/web/src/knowledge-bit/
- Depends on filter-contract-api
- Leaves an empty slot at the toolbar start for the search box; layout rules in spec.md Toolbar design
- Covers SCENARIO 1-13; subject list page and sidebar must keep working unchanged

## meaning-search-ui

### Scope
- The search knowledge box, its status lines and match percentages
- Out of scope: Other filters and the toolbar layout

### Goal
- The owner can search knowledge by meaning from the toolbar and understand every outcome.

### Criteria
- [x] Search runs only on Enter or the search button
- [x] Results show closest first with a match percentage
- [x] Not-ready and capped-results notes appear when they apply
- [x] Each refusal and empty outcome shows its own plain message
- [x] Clearing the box returns to the newest-first list

### Coding tasks
- [x] Add the Search knowledge box that searches only on Enter or the search button
- [x] Keep the search words in the page address and send them with the current filters
- [x] Show results closest first with a match percentage in the question cell, without Load more
- [x] Show the not-ready count and a note when only the closest 100 are shown
- [x] Show plain messages for spending limit, service failure, too many searches, nothing ready and nothing close
- [x] Never retry refused searches automatically; offer a retry only after a service failure
- [x] Test the search trigger, result order, notes and every message

### Notes
- Owns knowledge-browser-meaning-search.tsx, knowledge-browser-matches.api.ts, use-knowledge-browser-matches.ts, knowledge-browser-columns.tsx
- Edits knowledge-browser-screen.tsx only to fill the toolbar search slot and switch rows
- Depends on meaning-search-api, browser-toolbar-ui
- Covers SCENARIO 14-16; files under apps/web/src/knowledge-bit/

## demo-seed-data

### Scope
- Local demo pieces that exercise every filter and meaning search
- Out of scope: Any shared or production database

### Goal
- Every filter and meaning search can be tried locally on realistic pieces at zero cost.

### Criteria
- [x] Seed covers every source type, subject case and study state
- [x] Most seeded pieces have mock meaning data, a few do not
- [x] Seed refuses to run against anything but the local database

### Coding tasks
- [x] Write a local-only script that adds demo pieces covering every filter case
- [x] Give most demo pieces free mock meaning data and leave about five without
- [x] Make the script refuse any database other than the local development one

### Notes
- Owns apps/api/scripts/seed-knowledge-browser-demo.ts and its package script entry
- Depends on none
- Data list in spec.md Seed data; local dev database is pgvector pg16 on port 5562

## browser-e2e

### Scope
- End-to-end checks of filters, columns, selection and meaning search
- Out of scope: Paid embedding calls; the suite uses mock vectors

### Goal
- A browser run proves filters, columns, selection safety and meaning search work together.

### Criteria
- [x] Combined filters, chips and reload pass in a real browser
- [x] Hidden column filter and column reset pass in a real browser
- [x] Selection shrink note and honest source delete pass
- [x] Meaning search ranks mock pieces and shows the not-ready count

### Coding tasks
- [x] Check the shared mock service answers meaning requests, and add that if missing
- [x] Check combined column filters, chips, Clear all and reload in a real browser
- [x] Check hiding a filtered column, its chip, and Reset columns in a real browser
- [x] Check the unselected note and the honest delete-source count in a real browser
- [x] Check meaning search order, not-ready count and phone-width toolbar in a real browser

### Notes
- Owns a knowledge browser feature folder in verification-repo projects/post-anki/post-anki; exact path to verify
- Depends on browser-toolbar-ui, meaning-search-ui, demo-seed-data
- Run through npm run dev:pw from this repo, per e2e/README.md

