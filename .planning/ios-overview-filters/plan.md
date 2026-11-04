# Filter the Knowledge overview by state and origin on the server, then use it on iPhone

## Business behavior
- The iPhone Knowledge list narrows by study state (New, Learning, Review) and by where an item came from (Typed by you, Found by AI on the web, Pasted text, Notion, Article) on the server. Paging, "load more" and the empty state then reflect the filtered set, instead of filtering the loaded page on the phone (today a filter can show a nearly empty list while more matching items sit on later pages).
- Filters combine with the subject and text search: all must match. Several values inside one filter mean "any of these".
- "Search by meaning" mode also honors the same state and origin filters, so the menu no longer does nothing there.
- Nothing changes for existing callers (web overview, Mac app) that send no state/origin.

## Facts (current code)
- Route `GET /knowledge-bits/overview` -> `apps/api/src/knowledge-bit/knowledge-bit-overview.controller.ts` -> `listKnowledgeBitOverview` in `apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts`. Query schema `knowledgeBitOverviewQuerySchema` (subjectId, q, limit 1-100 default 50, offset) in `packages/shared/src/knowledge-bit-overview.ts:5`. Bad input -> 400 `invalid_input`.
- State vocabulary already shared: `knowledgeBitOverviewStateSchema` (new, learning, review, relearning, suspended, buried). Origin vocabulary: `knowledgeBitBrowserOriginValues` (manual, ai_web, pasted, notion, article) in `packages/shared/src/knowledge-bit-browser-filters.ts:6`.
- Web browser sends `states` and `origins` as comma-separated query values (`apps/web/src/knowledge-bit/knowledge-browser-filters.ts:85,91`); the server parses them with `parseKnowledgeBitBrowserFilters`, which keeps only known values and drops the rest silently (`:80-109`).
- SQL for both filters already exists: `studyStateSql(now)` and `sourceTypeSql` in `apps/api/src/knowledge-bit/knowledge-bit-browser-filters.ts:15,25`. The overview query already left-joins schedules and sources, so both expressions work in its WHERE clause. The overview computes row state in code (`deriveOverviewState`), so SQL and code must agree (both fall back to `review`).
- iOS: `KnowledgeListModel` (`apps/ios/Sources/Shared/KnowledgeListModel.swift`) holds `statusFilter` (All/New/Learning/Review/Suspended) and filters loaded items locally; Suspended opens a separate screen. API call is `APIClient.knowledgeOverview` in `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/APIClient+KnowledgeManage.swift`. Menu UI is in `apps/ios/Sources/PostAnkiIOS/KnowledgeListScreen.swift` (and mirrored in `apps/ios/Sources/PostAnkiMac/MacKnowledgeView.swift`, which shares the model).

## API contract
- New optional query params on `/knowledge-bits/overview`: `states` and `origins`, comma-separated (same wire format as `/knowledge-bits/browser`, so web and iOS share one convention).
- Validation: values outside the shared vocabularies are ignored, same as the browser route (Assumption: consistency with the browser is preferred over a 400; flag if strict rejection is wanted). Empty or all-unknown list = no filter. Existing `limit`/`offset` rules unchanged.
- Defaults: absent = no filter, identical results to today. Fully backward compatible; response shape unchanged.
- Semantics: `states` matches the derived state (suspended/buried win over phase); `origins` matches the derived origin. Filter applies before `limit`/`offset`, so `hasMore` is correct for the filtered set.

## Shared type changes (`packages/shared`)
- Add a small shared list-parsing helper and move the origin value list (and its type) into a new file imported by both overview and browser filter modules, avoiding an import cycle (browser-filters already imports overview). Browser module re-exports the origin names so existing imports keep working.
- Extend `knowledgeBitOverviewQuerySchema` with optional `states` (array of overview states) and `origins` (array of origins), each preprocessed from comma-separated text with the lenient helper. `KnowledgeBitOverviewQuery` type picks them up automatically.
- No change to the item/page response schemas.

## API changes (`apps/api`)
- Overview repo adds `states` / `origins` conditions using the existing `studyStateSql(now)` and `sourceTypeSql` (import from the browser filters module; do not duplicate SQL).
- Controller needs no logic change beyond passing the parsed query through (it already does).
- Optional, same unit: confirm `/knowledge-bits/browser/matches` accepts `states`/`origins` for the iPhone meaning mode (the iOS report says it takes filters); no change expected.

## Web typings
- `apps/web/src/knowledge-bit/knowledge-overview.api.ts` builds its own params from the parsed query: forward `states`/`origins` (join with commas) so the typed server function stays aligned. No web UI change; the web overview page keeps sending neither.

## iOS changes
- API client: `knowledgeOverview` gains `states: [String]` and `origins: [String]` (default empty, omitted from the URL when empty). Meaning-search client passes the same lists.
- List model: replace local `matches(_:)` filtering with server params. Map Status menu: All = none, New = [new], Learning = [learning, relearning], Review = [review]; Suspended keeps opening its own screen. Add an `originFilter` (All + five labelled origins; reuse the origin labels already in the meaning-results view). Changing either filter triggers `reload()` (cancels the in-flight load via the existing request token); `visibleItems` becomes `items`; remove the "Filtering loaded items" footer branch (`KnowledgeListScreen.swift:187`, `MacKnowledgeView.swift:207`). `hasActiveFilter` includes origin.
- Local state edits (suspend/bury from detail) still update the row; if the row no longer matches the active state filter, drop it from the list.
- Menu: add an origin submenu beside the status menu on iPhone; Mac view compiles against the shared model, so keep its menu working (add origin menu there or leave default All, decision for the iOS unit owner).
- Meaning mode: send the same states/origins with the single search request, so the filter is no longer inert.

## Tests
- Shared: schema accepts/omits lists, comma parsing, unknown values dropped, defaults unchanged (extend the existing overview schema test if present, else add one next to the schema).
- API: controller test (`knowledge-bit-overview.controller.test.ts`) that lists reach the repo and old queries behave the same; DB integration test for the repo: state filter (new/learning/review/suspended/buried, including buried-until in the past), origin filter (each of five origins), both together with subject and q, paging with `hasMore` on a filtered set, and SQL-state vs `deriveOverviewState` parity.
- Web: typing test or server-fn input test that the new params are forwarded.
- iOS: package test that the request URL includes/omits `states`/`origins` (encoded commas); model test that changing a filter resets paging and reloads with the right params; status-to-params mapping; row dropped after suspend under a state filter; meaning-search request carries filters. Run `swift test` in `Packages/PostAnkiAPI`, `xcodegen generate`, then `xcodebuild` for PostAnkiIOS and PostAnkiMac (shared folder touched).
- Gates: `npx tsc --noEmit`, project lint, `npx vitest run`.

## Split into two implementation units (sequential: unit 1 then unit 2)
Unit 1: API + shared + web typings. Owns:
- `packages/shared/src/knowledge-bit-overview.ts`, `packages/shared/src/knowledge-bit-browser-filters.ts`, new shared filter-list file, `packages/shared/src/index.ts` (exports) and shared tests
- `apps/api/src/knowledge-bit/knowledge-bit-overview.repo.ts`, `knowledge-bit-overview.controller.test.ts`, new overview-filters integration test, `apps/api/src/knowledge-bit/ingestion-pipeline.md` only if it documents the route
- `apps/web/src/knowledge-bit/knowledge-overview.api.ts` (and its test)
- Output handed to unit 2: final param names (`states`, `origins`), comma format, vocabulary.

Unit 2: iOS. Owns everything under `apps/ios/` (Package `PostAnkiAPI` client and tests/fixtures, `Sources/Shared/KnowledgeListModel*.swift`, `knowledge-meaning-search-model.swift`, `PostAnkiIOS/KnowledgeListScreen.swift`, `knowledge-meaning-results.swift`, `PostAnkiMac/MacKnowledgeView.swift`). Does not touch `apps/api`, `apps/web` or `packages/shared`.

## Risks and notes
- Another session has uncommitted edits in the repo, including `apps/api` knowledge-bit files; unit 1 should start from the current tree and not overwrite them (the overview repo and browser-filters files are not in the visible modified list, but re-check `git status` first).
- Cost: no new embedding or model calls; one extra WHERE clause per request.
- Open for the user: strict 400 on unknown values versus lenient ignore (plan assumes lenient); whether Mac gets the origin menu in this change.

END-OF-REPORT
