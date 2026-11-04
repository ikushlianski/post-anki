---
type: spec
branch: learn-from-doc-site
task: Open a piece's full version in a slide-over from the knowledge browser
complexity: medium
state: draft
updated: 2026-10-25
---
# Spec: Knowledge browser detail slide-over

### Summary
Clicking a row in the knowledge browser opens a read-only slide-over with the piece's full version: front, back, every phrasing with its own answer, where it sits (subject path, tags), where it came from, and how it is doing in review. The open piece is remembered in the page address, so a reload or a shared link reopens it. Selecting rows for deletion keeps working through the checkbox, shift-click and cmd/ctrl-click.

### The ask
Owner: "in the knowledge browser, clicking a single row should open a slide-over showing the item's full version: meta info, front, back and all variants (phrasings)."

Defaults given with the ask (no questions): read-only panel; closes on Esc, outside click and a close button; phone = full-width sheet; the address holds the open item id so reload keeps it; the open item survives list refetches; arrow keys between visible rows only if cheap.

### Build gate
Build starts only after the `meaning-search-ui` agent finishes. It is editing the browser screen, toolbar, route, filters and columns files, which this build also touches (list under "Files to modify"). Check before starting: that agent has reported done and `git status` shows no uncommitted edits left by it in those files. Only the API/shared aspect (`detail-contract-api`) touches no contested file, so it is the one piece that could start earlier if the owner asks.

### Facts (from code)
- Row click today toggles selection (shift = range); clicks on button, link, input or label inside the row are ignored: `apps/web/src/knowledge-bit/knowledge-browser-table.tsx:92-100`. Selection state, Delete and Escape handling live in `apps/web/src/knowledge-bit/use-knowledge-browser-selection-delete.ts:20-150` (Escape is skipped when `event.defaultPrevented`).
- A list item carries id, phrasings (`id`, `kind`, `prompt`), one answer (the preferred variant's), origin, source id/label/URL, added date, source piece count. It has no subject path, tags, context, example, review state, per-phrasing answers or fill-in-the-blank sentence: `packages/shared/src/knowledge-bit-browser.ts:37-53`, `apps/api/src/knowledge-bit/knowledge-bit-browser-items.ts:56-116`.
- Each active variant row stores its own `answer` and, for `fill_in_the_blank`, a `sentence`; kinds are `wh_question`, `fill_in_the_blank`, `basic`: `apps/api/src/db/schema.ts` (`knowledge_bit_question_variants`).
- The piece text is `knowledge_bits.body`; context and example share one column, `background` (manual items store `example` there, extracted items store the item's example): `apps/api/src/knowledge-bit/knowledge-bit-manual-item.repo.ts:40`, `knowledge-bit-source-items.repo.ts:97`. The verbatim source quote is checked at extraction and not stored on the piece.
- Review state lives in `knowledge_bit_schedules` (phase, due, lapses, review count, suspended, buried) and is turned into a state label by `deriveOverviewState`: `apps/api/src/knowledge-bit/knowledge-bit-overview-state.ts:10-28`.
- Tags are `tag_assignments` rows with node type `knowledgeBit` (`apps/api/src/knowledge-bit/knowledge-bit-tagging.repo.ts:74`). Subjects form a tree through `subjects.parent_id`; a piece's subject is its topic's curriculum subject, else its source's subject: `apps/api/src/knowledge-bit/knowledge-bit-subject.ts:5-7`.
- No single-piece read exists. Existing per-piece routes are `GET /knowledge-bits/:bitId/variants` (variants only) and writes: `apps/api/src/router-table.ts:434`.
- The chat sheet is a phone bottom sheet that becomes an inline column from the `sm` breakpoint, with a phone-only backdrop; it is not an overlay on desktop: `apps/web/src/knowledge-bit/knowledge-bit-chat-sheet.tsx:10-34`. Its scroll-lock hook is reusable: `apps/web/src/knowledge-bit/use-keyboard-offset.ts:36`.
- The browser route owns all address state and rebuilds the search object on filter change and Clear all: `apps/web/src/routes/knowledge.browser.tsx:20-48`; the lenient parser is `parseBrowserSearch` in `apps/web/src/knowledge-bit/knowledge-browser-filters.ts:112`.

### Data decision
List data is enough for the instant first paint (front, back, phrasings, source, date) but not for the panel's meta: subject path, tags, context/example, review state, per-phrasing answers, fill-in-the-blank sentence and ids are missing. One new read, `GET /knowledge-bits/:id`, supplies them. The panel opens at once from the list row when it is loaded and fills in the rest when the read returns; on a reload, where the row may not be on the first page, it waits for the read. The panel renders from its own read, never from the list, so a refetch, a filter change or a meaning search cannot close or blank it. Read-only means no edit controls: the existing edit and chat paths stay where they are.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---------|--------|--------|-------------------|
| Row click intent | click modifiers, click target | open panel / toggle selection / range select / ignore | SCENARIO 1, 2 |
| Subject path | subject id, all subjects | ordered names from top-level to leaf, cycle-safe | SCENARIO 3 |
| Detail view model | detail payload, optional list row | front, back, phrasing list with card type labels, meta rows | SCENARIO 3, 4 |
| Neighbour row | visible row ids, open id, direction | next row id or none | SCENARIO 8 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| 1 Click opens panel | None | knowledge-browser-table.tsx, knowledge-browser-screen.tsx, knowledge-browser-open-item.ts | None |
| 2 Selection keeps working | None | knowledge-browser-table.tsx, knowledge-browser-open-item.ts | None |
| 3 Full version shown | knowledge-bit-detail.{repo,controller}.ts, knowledge-bit-detail-subject-path.ts, router-table.ts | knowledge-browser-detail-panel.tsx, knowledge-browser-detail-body.tsx, use-knowledge-browser-detail.ts, knowledge-browser-detail.api.ts | None |
| 4 Loading, missing, failed | knowledge-bit-detail.controller.ts (404) | knowledge-browser-detail-panel.tsx, use-knowledge-browser-detail.ts | None |
| 5 Close three ways | None | knowledge-browser-slide-over.tsx, knowledge-browser-detail-panel.tsx | None |
| 6 Reload keeps it | None | knowledge-browser-filters.ts, knowledge.browser.tsx, knowledge-browser-screen.tsx | None |
| 7 Survives refetch and filters | None | use-knowledge-browser-detail.ts, knowledge-browser-screen.tsx | None |
| 8 Arrow keys (optional) | None | knowledge-browser-open-item.ts, knowledge-browser-screen.tsx | None |
| 9 Phone sheet | None | knowledge-browser-slide-over.tsx | None |

### Files to create
```
packages/shared/src/knowledge-bit-detail.ts            detail payload schema + card-type labels
apps/api/src/knowledge-bit/knowledge-bit-detail.repo.ts        one read: piece, source, variants, tags, schedule
apps/api/src/knowledge-bit/knowledge-bit-detail.controller.ts  GET /knowledge-bits/:id (404 if unknown or not approved)
apps/api/src/knowledge-bit/knowledge-bit-detail-subject-path.ts  subject path from the subject tree
(+ co-located tests for each)
apps/web/src/knowledge-bit/knowledge-browser-detail.api.ts     server function for the read
apps/web/src/knowledge-bit/use-knowledge-browser-detail.ts     query hook keyed by id
apps/web/src/knowledge-bit/knowledge-browser-slide-over.tsx    overlay shell: right drawer / phone full-width sheet
apps/web/src/knowledge-bit/knowledge-browser-detail-panel.tsx  header, states, close
apps/web/src/knowledge-bit/knowledge-browser-detail-body.tsx   sections: front/back, phrasings, meta
apps/web/src/knowledge-bit/knowledge-browser-open-item.ts      click intent + neighbour deriver
(+ co-located tests for each)
```

### Files to modify
```
packages/shared/src/index.ts  (export the new detail module)
apps/api/src/router-table.ts  (add GET /knowledge-bits/:id AFTER the literal /knowledge-bits/* GET routes; must not shadow them)
  used by: router dispatch; tests: apps/api/src/router.test.ts
docs/architecture/knowledge-bit/knowledge-browser.md  (describe the detail read and the panel)
CONTESTED with meaning-search-ui (build waits for it):
apps/web/src/knowledge-bit/knowledge-browser-table.tsx  (row click: open instead of toggle; cmd/ctrl-click toggles; highlight open row; must not change columns, drag, checkbox)
  tests: knowledge-browser-table.test.tsx
apps/web/src/knowledge-bit/knowledge-browser-screen.tsx  (mount the panel; pass open id and handlers; must not change toolbar or meaning search wiring)
  tests: knowledge-browser-screen.test.tsx
apps/web/src/knowledge-bit/knowledge-browser-filters.ts  (add an `open` address field; parse leniently; keep out of the filter list and filter count)
  tests: knowledge-browser-filters.test.ts
apps/web/src/routes/knowledge.browser.tsx  (carry `open` through filter, subject and Clear all changes; add open/close navigation)
```
Not touched: the toolbar, meaning search, columns files, column filter files, the chat sheet, and the selection-delete hook (Escape ordering is solved with a capture-phase listener in the new shell).

### Risk & rollout
- Row click changes meaning: plain click used to select. Existing table/screen tests that click a row to select must be rewritten to use the checkbox or cmd/ctrl-click. Delete flows must still pass.
- New route `GET /knowledge-bits/:id` is a regex route; placed before the literal routes it would swallow `overview`, `browser`, `export` and others. Ordering is covered by a router test.
- Standard deploy otherwise: no migration, no config, no new dependency, read-only.

### Seed data
| Scenario | Realistic data needed | Source |
|----------|-----------------------|--------|
| 3 | One piece with three phrasings (basic, why, fill-in-the-blank), two tags, a nested subject, a source link, context text and a due date; one suspended piece | extend the demo seed used by the browser |

### Documentation changes
`docs/architecture/knowledge-bit/knowledge-browser.md`: add the single-piece read (path, response shape, 404 rule, no cost) and a short "Detail slide-over" section (open id in the address, row click rules, close rules).

### Decisions made autonomously
- Plain click opens the panel and never changes selection; checkbox, shift-click (range) and cmd/ctrl-click (toggle) change selection. Reason: one rule with no modes, and it keeps every existing multi-select path.
- Context and example are shown as one "Context / example" block. Reason: they share one stored field.
- The verbatim source quote is not shown. Reason: it is not stored; the panel shows source label, link and type instead.
- The read serves approved pieces only, like the browser list; anything else is 404. Reason: no way to see unreviewed pieces through the browser.
- Desktop panel is a right drawer without dimming; an outside click closes it unless the click lands on another row, which switches the open piece. Phone shows a dimmed backdrop and tapping it closes. Reason: lets the owner scan rows quickly while reading.
- Opening pushes an address entry; switching pieces replaces it; closing removes the field. Reason: phone Back closes the panel, arrow-key browsing does not flood history.
- Escape closes the panel before it clears a selection; Delete key is ignored while the panel is open. Reason: avoid a hidden bulk-delete prompt.
- New shell component instead of changing the chat sheet. Reason: the chat sheet is inline on desktop and its tests would churn; the shell reuses the same scroll-lock hook and dialog markup pattern.
- Open item uses address key `open`. Reason: short, not a filter, kept out of the active-filter count.
- Grill phase not run (task said no questions; no subagent access). Spec stays `draft`.

### Implementation order
1. Subject path deriver, then the detail read (repo, controller, route) with integration test, covers SCENARIO 3, 4
2. Shared schema and web server function, covers SCENARIO 3
3. Click-intent deriver, neighbour deriver (red-green-refactor), covers SCENARIO 1, 2, 8
4. Slide-over shell, then panel and body, covers SCENARIO 3, 4, 5, 9
5. Address field and route wiring, then table and screen wiring, covers SCENARIO 1, 2, 6, 7
6. Arrow keys (optional), docs

### Scope boundary
- Editing, deleting, moving, chatting or suspending from the panel (read-only by default).
- Showing the verbatim source quote (not stored).
- Per-piece review history or attempts list.
- Changing the chat sheet, the toolbar, columns or filters.
- Arrow keys are kept only if they stay a small addition after step 5; otherwise cut.
