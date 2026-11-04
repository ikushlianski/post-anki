## detail-contract-api

### Scope
- One read returns a piece's full version: text, phrasings, subject path, tags, source, review state
- Out of scope: Any screen change, any write, any edit

### Goal
- One read returns an approved piece's full version, free and read-only.

### Criteria
- [x] Approved piece returns phrasings with own answers
- [x] Subject path, tags, source and review state included
- [x] Unknown or unapproved id answers not found
- [x] Literal knowledge-bits routes still resolve
- [x] No paid call and no write

### Coding tasks
- [x] Define the shared shape of a piece's full version, including card type labels
- [x] Work out a subject's path from the top-level subject down, safe against loops
- [x] Read one approved piece with its phrasings, tags, source, subject path and review state
- [x] Add the single-piece route after the fixed routes and answer not found for unknown or unapproved pieces
- [x] Test the read on the local test database and check fixed routes are not swallowed
- [x] Describe the new read in the knowledge browser architecture doc

### Notes
- Owns packages/shared/src/knowledge-bit-detail.ts and packages/shared/src/index.ts
- Owns apps/api/src/knowledge-bit/knowledge-bit-detail*.ts and apps/api/src/router-table.ts
- Owns docs/architecture/knowledge-bit/knowledge-browser.md
- Depends on none; build starts after meaning-search-ui finishes (spec Build gate)

## detail-panel-shell

### Scope
- A reusable slide-over: right drawer on wide screens, full-width sheet on phones
- Closes on Esc, outside click and a close button
- Out of scope: What the panel shows, the address, row clicks

### Goal
- A read-only slide-over that opens beside the table and fills the phone.

### Criteria
- [x] Esc, outside click and close button all close it
- [x] Esc closes the panel before clearing a selection
- [x] Clicking another row does not close it on wide screens
- [x] Phone shows full-width sheet and locks page scroll
- [x] Focus moves in on open and back to the row on close

### Coding tasks
- [x] Build a slide-over: right drawer on wide screens, full-width dimmed sheet on phones
- [x] Close on Esc before other Escape handlers run, and on the close button
- [x] Close on an outside click, except a click on a table row, which switches the piece
- [x] Lock page scroll on phones, move focus in on open and back to the row on close
- [x] Test each way of closing, phone layout and Escape order against an active selection

### Notes
- Owns apps/web/src/knowledge-bit/knowledge-browser-slide-over.tsx and its test
- Depends on none; reuses the scroll-lock hook, leaves the chat sheet and selection hook untouched

## detail-panel-content

### Scope
- The panel loads one piece by id and shows front, back, phrasings and details
- Handles loading, missing and failed states
- Out of scope: Row clicks, the page address, editing anything

### Goal
- Show a piece's whole story, instantly from the row and fully from its own read.

### Criteria
- [x] Front, back and every phrasing with its answer shown
- [x] Subject path, tags, context, source and review state shown
- [x] Empty fields read None, never blank
- [x] Missing piece and failed load have clear states
- [x] Panel has no edit, delete or move controls

### Coding tasks
- [x] Load one piece by id and refresh it whenever browser data is refreshed
- [x] Show front, back and each phrasing with its card type, answer and blank sentence
- [x] Show subject path, tags, context or example, source, who added it, date and review state
- [x] Paint the row's text first when it is loaded, then fill in details when the read returns
- [x] Show clear missing and failed states, with Retry that keeps the row text visible
- [x] Test a full piece, a bare piece, a suspended piece, a missing piece and a failed load

### Notes
- Owns apps/web/src/knowledge-bit/knowledge-browser-detail.api.ts and use-knowledge-browser-detail.ts
- Owns apps/web/src/knowledge-bit/knowledge-browser-detail-panel.tsx and knowledge-browser-detail-body.tsx, with tests
- Depends on detail-contract-api and detail-panel-shell

## row-click-and-address

### Scope
- A plain row click opens the panel; selection keeps working
- The open piece lives in the page address and survives refreshes
- Out of scope: Toolbar, meaning search, filters and columns behavior

### Goal
- A plain click opens a piece, selection still works, and a reload keeps it open.

### Criteria
- [x] Plain click opens the panel and never changes selection
- [x] Checkbox, shift-click and cmd/ctrl-click select as intended
- [x] Reload and shared link reopen the same piece
- [x] Filters, subject and Clear all keep the panel open
- [x] Open piece survives refresh, load more and meaning search

### Coding tasks
- [x] Decide what a click means: open, toggle, range or ignore, from modifier keys and target
- [x] Make a plain row click open the piece and highlight the open row, keeping checkbox and shift-click
- [x] Let cmd or ctrl click add or remove one row from the selection
- [x] Keep the open piece in the page address, outside the filters, through every address change
- [x] Open adds a history entry, switching replaces it, closing removes the piece from the address
- [x] Mount the panel on the browser screen so it ignores list refreshes, filters and meaning search
- [x] Rewrite row-click tests that selected by plain click, and test every selection and delete path
- [x] Describe the panel's row-click and address rules in the knowledge browser architecture doc

### Notes
- Owns apps/web/src/knowledge-bit/knowledge-browser-open-item.ts and its test
- Owns, shared with meaning-search-ui, so build waits: knowledge-browser-table.tsx, knowledge-browser-screen.tsx and their tests
- Owns, shared with meaning-search-ui: knowledge-browser-filters.ts, routes/knowledge.browser.tsx and the filters test
- Depends on detail-panel-shell and detail-panel-content; also docs/architecture/knowledge-bit/knowledge-browser.md

## arrow-key-browsing

### Scope
- Up and Down move the open piece between visible rows (optional, only if small)
- Out of scope: Loading more rows, any other shortcut

### Goal
- Move through visible pieces with the keyboard while the panel is open.

### Criteria
- [x] Up and Down switch to the neighbouring visible row
- [x] Nothing happens at the first or last row
- [x] Typing in a filter or search box is never hijacked
- [x] Moving does not add a history entry per step

### Coding tasks
- [x] Find the neighbouring visible row for Up and Down, stopping at the ends
- [x] Switch the open piece on Up and Down, ignoring typing fields, without piling up history
- [x] Test neighbour lookup at both ends and key handling while typing

### Notes
- Owns the neighbour deriver in knowledge-browser-open-item.ts and a key listener in knowledge-browser-screen.tsx
- Depends on row-click-and-address; cut if it grows beyond a small addition

