# iOS to web parity: subjects tree, cards browser, triage attention, search

Scope: the iPhone app (apps/ios, target PostAnkiIOS) gets the same browse and triage capabilities as the web app. Plan only; no code written.

## Business summary

- Today the phone app can triage, review and list cards, but it shows subjects as a flat list with no sense of progress, searches cards by one text box only, and never tells the user that a pasted note failed to turn into cards.
- After this work the phone shows the same subject tree as the website with a coloured new / learning / mature bar, a cards browser with filters and "search by meaning", and a "Needs attention" block in Triage with Retry and Retry all.
- Card actions (suspend, move, delete, several at once) work from the browser rows.
- Everything stays online-only. The phone does not get an offline copy of the library in this item. Reviewing and answering offline keeps working as it does now.
- Each slice ships on its own. After slice 0, slices 1, 2 and 3 can be built in parallel by three implementers.

## Facts vs assumptions

Labels: **F** = read directly in code (path given), **A** = assumption or hypothesis.

## Inventory: what iOS has today

- **F** The tab bar (apps/ios/Sources/PostAnkiIOS/HomeView.swift) has five tabs: Triage, Add, Review, Knowledge, Subjects.
- **F** The Home screen, Progress screen and global search exist as files, but no tab opens Home. Global search is only reachable through the Home daily section (HomeDailySection.swift) and Mac, so it is effectively not reachable on iPhone. (A: confirm no other entry point at implementation time.)
- **F** Subjects tab (PostAnkiIOS/SubjectsScreen.swift, 171 lines): top-level subjects only, each row shows a name and "N sub-subjects"; tapping opens a detail screen with sub-subject links, a hardest-cards block, and a plain card list from GET /knowledge-bits/overview (limit 100, no paging). No counts, no depth bar, no tree expansion.
- **F** Knowledge tab (PostAnkiIOS/KnowledgeListScreen.swift plus Shared/KnowledgeListModel.swift and KnowledgeListModel+Bulk.swift): paged list from GET /knowledge-bits/overview, subject picker, one text query (debounced, server side, `q`), state filter (All/New/Learning/Review/Suspended) applied only to already-loaded items on the client, edit-mode multi-select with bulk Move and Delete (max 200), a link to the suspended list, row tap opens KnowledgeItemDetailScreen (suspend / unsuspend / bury).
- **F** Triage tab = Shared/KnowledgeItemInboxScreen.swift host (KnowledgeInboxScreen in Shared/KnowledgeInboxMode.swift) with a segmented control "Pending items" (Shared/PendingReviewScreen.swift, 310 lines) and "Placement suggestions". Pending list loads GET /knowledge-bits/pending-review without the attention flag. The tab badge uses the pending count only (PendingReviewCountStore), not attentionCount.
- **F** Per-source regeneration exists (Shared/SourceRegenerationRow.swift, SourceRegenModel.swift: POST then poll /knowledge-sources/:id/regeneration), but it sends an empty body, so "retry with edited text" and model choice are not possible.
- **F** No discard-source call in the iOS API package. Triage-session discards exist, but those are a different endpoint.
- **F** API package (apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI): static `APIClient` extensions per area; has overview, schedule, deletions, moves, pending-review, approvals, search, regeneration. It has no client for /knowledge-bits/browser, /browser/subjects or /browser/matches.
- **F** Local store: JSON-file queues for review answers and grades (Shared/PendingAnswerQueue.swift, PendingGradeQueue.swift) flushed on app foreground. PowerSync is a DEBUG-only spike (Sources/PowerSyncSpike, `#if DEBUG`). No local database for browsing.
- **F** Sources/Shared is compiled by the iOS, iOS Dev and Mac targets (apps/ios/project.yml). New shared files must compile on macOS, or be wrapped in `#if os(iOS)`, or live under Sources/PostAnkiIOS.

## Inventory: what web has (relevant to this item)

- **F** Subjects page /subjects (apps/web/src/routes/subjects.index.tsx, knowledge-bit/knowledge-subjects-screen.tsx, knowledge-browser-subject-list.tsx): expandable tree built from path labels ("A › B"), each parent's count and new/learning/mature rolled up over the subtree, a "No subject" entry for unsorted cards, DepthBar with three segments, a total count per row, tapping goes to the browser filtered by subject.
- **F** Cards browser (knowledge-browser-screen.tsx, -table, -toolbar, -filter-panel, -filters.ts, -detail-panel, -action-bar): paged GET /knowledge-bits/browser with filters (question text, answer text, origins, addedBy, link has/none, site, from/to date, states incl. suspended/buried), filter chips, sortable and re-orderable columns, detail panel, selection, delete selected, delete whole source (POST /knowledge-bits/purges).
- **F** Meaning search (knowledge-browser-meaning-search.tsx, knowledge-browser-matches.api.ts): GET /knowledge-bits/browser/matches, `q` up to 300 chars, same filters, returns items with similarity plus readyCount / notReadyCount / capped (max 100).
- **F** Overview page (knowledge-overview-screen.tsx, use-knowledge-overview-row-actions.ts): row suspend/unsuspend, bulk suspend, move dialog, delete dialog, export (/knowledge-bits/export).
- **F** Triage page attention block (knowledge-bit-review-attention-block.tsx, -notice.tsx, use-attention-notices.ts): "Needs attention (N)" section above the cards. Each notice shows first words, age, plain-language reason (shared `attentionWording`), collapsible note text, Retry, Retry with edited text, Discard (with confirm). "Retry all (N)" appears when more than one notice and enables only for notices not already retrying. Loaded via GET /knowledge-bits/pending-review?attention=1. Kinds: failed, empty_result, stuck, rate_limited (rate_limited is styled as info, not error).
- **F** Sidebar badge uses `attentionCount` from GET /knowledge-bits/pending-review/count (apps/web/src/nav/sidebar.tsx).
- **F** Find page (routes/find.tsx) and global search exist on web; iOS has an equivalent API call (/search) but only for courses/topics/subjects (Shared/GlobalSearchModel.swift). (A: web /find searches cards; not re-read in depth, confirm before slice 6.)

## Gap table

| Feature | Web | iOS | Fact / assumption |
|---|---|---|---|
| Subject tree (nested, expandable) | Yes, path-label tree, rolled-up counts | Top-level list, drill-in per level | F: both files read |
| Depth bar new/learning/mature | Yes (DepthBar) | No | F |
| Per-subject card count | Yes | No (sub-subject count only) | F |
| "No subject" bucket | Yes | No | F |
| Counts endpoint /knowledge-bits/browser/subjects | Used | No client, no model | F (route in router-table.ts; schema in packages/shared/src/knowledge-bit-browser.ts) |
| Cards list with paging | Yes (/browser) | Yes (/overview) | F |
| Text search | question and answer filters, separate | single `q` on /overview | F |
| Meaning (semantic) search | Yes (/browser/matches) | No | F |
| Filters: origin, added-by, link, site, dates | Yes | No | F |
| State filter | Server side, 6 states | Client side over loaded pages, 4 states + suspended screen | F |
| Sort / column choice | Yes | No (not needed on phone) | F; A: not wanted on phone |
| Card detail (all phrasings, source link) | Panel | Question/answer + schedule actions only | F; A: phrasings need /browser item shape |
| Suspend / unsuspend / bury a card | Yes (row and bulk) | Yes (detail screen only) | F |
| Move cards | Yes | Yes (bulk) | F |
| Delete cards | Yes | Yes (bulk) | F |
| Delete whole source | Yes (/purges) | No | F |
| Needs attention block | Yes | No | F |
| Retry / Retry all | Yes | Per-source regeneration exists elsewhere, not surfaced for failed notes | F |
| Retry with edited text | Yes | No (empty regeneration body) | F |
| Discard failed note | Yes (/knowledge-sources/:id/discards) | No | F |
| Attention count in tab badge | Yes | No (pending count only) | F |
| Offline browsing | No | No | F |
| Card search reachable on phone | Yes (/find) | Not reachable | F for reachability; A for /find scope |

## API needs (all existing server routes)

- **F** Exist in apps/api/src/router-table.ts: GET /knowledge-bits/browser, GET /knowledge-bits/browser/subjects, GET /knowledge-bits/browser/matches, GET /knowledge-bits/pending-review (supports `?attention=1`), GET /knowledge-bits/pending-review/count (returns `attentionCount`), POST /knowledge-sources/:id/regeneration, POST /knowledge-sources/:id/discards, POST /knowledge-bits/purges, PATCH /knowledge-bits/:id/schedule, POST /knowledge-bits/moves, POST /knowledge-bits/deletions, GET /subjects.
- **Server gaps: none found.** All gaps are on the iOS client side (missing Swift models and client methods).
- **A** POST regeneration accepts optional `modelId` and `text` (web sends both, apps/web/src/knowledge-bit/knowledge-bit-review.api.ts:148). The server handler was not opened; the slice 0 implementer confirms before adding the field.
- **A** The subjects tree can be built from GET /subjects (already used by iOS) by walking `parentId`; the web builds it from path labels. Walking `parentId` is cleaner on iOS and gives identical grouping. Counts roll up client side exactly as the web does (own plus all descendants).
- Wire shape to model in Swift: browser item (knowledgeBitId, phrasings[{id,kind,prompt}], answer, origin, sourceId, sourceLabel, sourceUrl, addedAt, sourcePieceCount); page (items, hasMore, total); counts rows (subjectId nullable, count, newCount, learningCount, matureCount); matches (items + similarity, readyCount, notReadyCount, capped); attention (knowledgeSourceId, kind, reason, since, firstWords, sourceText) as read from packages/shared/src/extraction-failure.ts and knowledge-bit.ts (shape partly read; confirm field list against the schema).
- Paging for browser uses limit/offset; the existing iOS overview paging pattern (KnowledgeListModel) is the template.

## Local store / offline implications

- No local library copy exists and PowerSync is debug-only, so all new screens are online-only. This matches the existing Knowledge and Subjects tabs.
- New screens must show a clear "couldn't load" state with Try again (existing pattern: ContentUnavailableView in KnowledgeListScreen) and keep the previous list on pull-to-refresh failure.
- Do not queue writes (suspend, move, delete, retry, discard) offline; show the error and leave state unchanged. Reason: these are destructive or server-driven, and no queue exists for them. Flag to user if offline edits are wanted later; it needs a store decision (PowerSync vs file queues), outside this item.
- Subject counts and attention counts are cached in memory only for the screen lifetime; refresh on appear and pull-to-refresh.
- Retry polling (3 s, up to 100 polls in SourceRegenModel) is a cost and runaway risk. Retry all must cap concurrent regenerations (suggest 3 at a time) and respect the existing poll cap. Each retry costs one AI extraction on the server.
- Security: note text, reasons and card text are untrusted display data. Render as plain text only, never interpreted as links or instructions.

## Slice plan

Order and parallelism: 0 first; then 1, 2, 3 in parallel (disjoint files); then 4 (needs 2); then 5 (needs 2 and 4 files stable).

### Slice 0: Client foundations (API package only)

- Adds Swift models and client methods for browser page, subject counts, meaning matches, attention fields on pending-review sources, attention count, discard source, regeneration with optional text, purge source.
- Adds decoding tests with JSON fixtures in Packages/PostAnkiAPI/Tests (existing pattern: Fixtures folder, PendingReviewDecodingTests.swift).
- Adds a stub `CardBrowserScreen(subjectId:)` view (Shared/card-browser-screen.swift, placeholder body) so slice 1 can link to it without waiting for slice 2.
- Ownership: Packages/PostAnkiAPI/** and the one stub file. No other SwiftUI file touched.
- Endpoints: none new; client only.
- Done when: `swift test` in the package passes and the app target builds.

### Slice 1: Subjects tree with depth bar

- Subjects tab shows the nested tree, expand/collapse, per-row count, 3-segment bar (mature green, learning amber, new blue, same order as web), "No subject" row when unsorted cards exist. Tap on a row opens the card browser filtered to that subject (including descendants; match web behaviour, A: web filters by the single subject id, confirm descendants handling).
- Keeps Manage subjects link and profile sheet. Keeps SubjectDetailScreen reachable for Start review / hardest cards (decision for implementer: keep as a secondary action on row long-press or in the browser header; do not lose Start review).
- Ownership: PostAnkiIOS/SubjectsScreen.swift (rewrite), new Shared/subject-tree-model.swift, subject-tree-row.swift, subject-depth-bar.swift. Pure functions for tree building and roll-up are unit-testable.
- Endpoints: GET /subjects, GET /knowledge-bits/browser/subjects (both exist).
- Depends on slice 0. Must not edit HomeView.swift.

### Slice 2: Cards browser (list, paging, text search, state and subject filters)

- Replaces the Knowledge tab content with a browser backed by GET /knowledge-bits/browser: server-side state filter (all six states), question/answer text search (debounced 300 ms as now), subject filter, paging, row shows first phrasing, answer, source label, added date, state chip. Detail screen shows all phrasings and source link.
- Fixes the existing client-side "Filtering loaded items" limitation by moving state filtering to the server.
- Ownership: fills Shared/card-browser-screen.swift (stub from slice 0), new card-browser-model.swift, card-browser-row.swift, card-browser-detail.swift; retires KnowledgeListScreen.swift and KnowledgeListModel.swift only at the end of slice 4 (keep until then so bulk actions do not regress); edits HomeView.swift tab wiring (only slice 2 and later slices may touch it).
- Endpoints: GET /knowledge-bits/browser (exists).
- Depends on slice 0 (and slice 1 does not depend on it thanks to the stub).

### Slice 3: Needs-attention block with Retry and Retry all

- In Triage "Pending items", a "Needs attention (N)" section above the cards: first words, age, plain-language reason, "Show note text", Retry, Retry with edited text, Discard with confirmation. "Retry all (N)" when more than one, enabled only for notices not already retrying; rate_limited shown as informational. Triage tab badge adds attention count.
- Reuses SourceRegenModel polling; adds a small coordinator capping concurrent retries and handling partial failure ("2 of 5 could not start").
- Wording must come from the same text table as web (packages/shared extraction-failure.ts). Plan: duplicate the wording table in Swift with a test comparing against the TS keys, or fetch wording from the API if available (A: API returns raw `reason` code; wording is client side on web, so Swift needs its own copy; flag drift risk to user).
- Ownership: Shared/PendingReviewScreen.swift (310 lines; split while touching it), PendingReviewListModel.swift, PendingReviewCountStore.swift, new Shared/attention-block.swift, attention-notice.swift, attention-retry-coordinator.swift, attention-wording.swift. HomeView.swift badge line is the only cross-file edit; ask slice 2 owner to land first or make the edit a one-line rebase.
- Endpoints: GET /knowledge-bits/pending-review?attention=1, GET /knowledge-bits/pending-review/count, POST /knowledge-sources/:id/regeneration, GET /knowledge-sources/:id/regeneration, POST /knowledge-sources/:id/discards (all exist).
- Depends on slice 0.

### Slice 4: Card row actions and bulk

- Swipe and context menu on browser rows: suspend/unsuspend, bury, move to subject (reuse Shared/KnowledgeMoveSheet.swift), delete with confirm. Edit mode multi-select: bulk suspend, move, delete (limit 200, same as now), delete whole source (confirm text states piece count, as web).
- Moves the logic of KnowledgeListModel+Bulk.swift into the browser model, then deletes the old Knowledge list files.
- Ownership: card-browser-model.swift, new card-browser-actions.swift, card-browser-selection-bar.swift, KnowledgeMoveSheet.swift; deletes KnowledgeListScreen.swift, KnowledgeListModel*.swift, previews referencing them.
- Endpoints: PATCH /knowledge-bits/:id/schedule, POST /knowledge-bits/moves, POST /knowledge-bits/deletions, POST /knowledge-bits/purges. There is no bulk-suspend endpoint on iOS today; web bulk suspend calls the schedule route per id (A: from use-knowledge-overview-row-actions.ts `setSuspendedMany`, loop vs batch not confirmed). Cap and serialize the loop; report partial failures.
- Depends on slice 2.

### Slice 5: Advanced filters and meaning search

- Filter sheet (origin, added by, link has/none, site, date range) with removable chips; a "Search by meaning" mode in the browser search bar that calls /browser/matches, shows similarity, and the "N cards not ready for meaning search yet" note and the capped notice from readyCount / notReadyCount / capped.
- Ownership: new card-browser-filters.swift, card-browser-filter-sheet.swift, card-browser-meaning-search.swift; small edits to card-browser-model.swift (coordinate: run after slice 4 or fold into one implementer if run in parallel is unwanted).
- Endpoints: GET /knowledge-bits/browser (filters), GET /knowledge-bits/browser/matches (both exist). Reversed date range returns 400 invalid_date_range; validate on the client first.
- Depends on slices 2 and 4.

### Optional slice 6: Make card search reachable

- Put a search entry on the Knowledge tab only if slice 2 plus 5 do not already cover the web /find use case (A). Decide after slice 5; likely not needed.

### Parallelism map

| Slice | Files owned | Parallel with |
|---|---|---|
| 0 | Packages/PostAnkiAPI/**, stub card-browser-screen.swift | none (first) |
| 1 | PostAnkiIOS/SubjectsScreen.swift, subject-tree-* | 2, 3 |
| 2 | card-browser-* (list/model/row/detail), HomeView.swift | 1, 3 |
| 3 | PendingReview*.swift, attention-* | 1, 2 (HomeView badge line conflicts with 2; sequence that one line) |
| 4 | card-browser-model.swift + actions, old Knowledge list removal | none (after 2) |
| 5 | card-browser-filter-*, meaning-search | none (after 4) |

## Verification without a device

- Regenerate the project, then build for the simulator, unsigned: `xcodegen generate` then `xcodebuild -project PostAnkiIOS.xcodeproj -scheme PostAnkiIOS -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build` (command from apps/ios/README.md). Run from apps/ios; never open or print Local.xcconfig or .env files.
- Also build the Mac scheme (Sources/Shared is shared with it) so new Shared files do not break macOS.
- `swift test` in apps/ios/Packages/PostAnkiAPI for decoding of the new models against fixtures. Pure-logic tests (tree roll-up, bar proportions, attention wording, retry coordinator cap) go in the existing smoke-test target pattern (Tests/PostAnkiMacSmokeTests with FakeServer.swift); A: confirm how that target is run (mac scheme).
- Compare tree roll-up and bar proportions against a fixed counts fixture shared with the web test data so iOS and web agree.
- Previews: add `#Preview` entries using the existing previews/ sample-data helpers for each new screen (empty, loading, error, long lists).
- Cannot be verified without a device or live account: real-network behaviour against the deployed API and auth token, swipe/haptic feel, one-handed reach and keyboard overlap, performance with thousands of cards, live AI retry outcome (costs tokens), TestFlight/free-install signing, background and foreground queue flush timing. Simulator screenshots are a possibility (A: simulator can be booted locally) but cannot prove API results without a running local API and token.
- Review checklist per slice: compiles on both iOS and Mac targets, no `any`-equivalents (force casts), files under ~300 lines, errors shown not swallowed, destructive actions confirmed.

## Open questions for the user (only if the defaults are wrong)

- Default assumed: online-only, no offline library. Say if you want offline browsing; that changes the plan (local store decision first).
- Default assumed: Retry all runs at most 3 retries at a time. Each retry spends AI budget.
- Default assumed: tapping a subject row opens the cards browser for that subject; "Start review" stays reachable from the browser header.

END-OF-REPORT
