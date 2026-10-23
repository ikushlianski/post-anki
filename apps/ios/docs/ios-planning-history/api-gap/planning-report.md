# API gap planning report

## Plans
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/progress/plan.md: Home summary and streak, Progress tab (milestones, retention, weekly digest), course stats on the course screen.
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/manage-knowledge/plan.md: Knowledge list with subject/status filters and search, item detail with suspend, Suspended list, bulk delete and move, editing in the Review tab and on the Due card, reject reason prompt.
- /Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/study-tools/plan.md: Ask screen over all cards, topic hub with study chat and notes, notes search, open questions with answer/dismiss.

All 21 routes in the gap report were checked against `apps/api/src/router-table.ts`, the `api-server.ts` dispatch, the controller and the Zod schema; every one is wired. Each plan cites file:line for method, path, inputs, response shape and error codes.

## Dropped pieces and why
- Per-topic and per-area retention breakdown (progress): the breakdown `key` is a raw topic or area ID with no name (`packages/core/src/analytics/mastery-breakdown.ts:57-90`); web prints the ID too. Only the overall retention and time-to-mastery numbers are planned.
- Editing wording from the Knowledge list (manage-knowledge): the overview response has no variant id or item body, and no GET route returns an approved item's variants with ids. Editing is planned where ids exist: the Review tab (pending items: wording, background, all variants) and the Due today card (the variant shown). Item wording edits only work for pending items on the server anyway (`apps/api/src/knowledge-bit/knowledge-bit.repo.ts:192-197`).
- Server-side status filter for the Knowledge list: the overview has no status param. The filter runs on loaded pages; "Suspended" uses the dedicated suspended list.
- Not in any todo, so not planned: generating course recommendations, note concern tagging, note review, capturing open questions.

## Shared-file assignments
- `HomeView.swift`: progress only (adds the Progress tab, reorders to Home, Courses, Review, Progress, Ingest, Inbox).
- `HomeScreen.swift`: progress edits the top of the `List` (summary section), the model `@State`, `.refreshable` and `.task`. Study-tools inserts one `HomeStudyToolsSection()` right after the "Add knowledge" section and touches nothing else. The hunks are about 10 lines apart.
- `CoursesScreen.swift`: progress edits only inside `CurriculumDetailScreen` (stats section, `@State`, refresh/task). Study-tools edits only inside `TopicRow` (one new icon link). `CoursesScreen` struct is untouched by both.
- `KnowledgeItemChatScreen.swift`: study-tools only (extracts shared chat row and composer into a new `ChatViews.swift`).
- `PendingReview*` files, `API/APIClient+PendingReview.swift`, `DueReviewModel.swift`, `DueReviewScreen.swift`: manage-knowledge only.
- `API/APIClient.swift` and `API/Models.swift`: no plan edits them; each plan adds its own `API/APIClient+<Feature>.swift` and `API/<Feature>Models.swift`.
- No new shared file: each plan keeps a feature-local error mapper and reuses `DueReviewModel.nextDueText(_:)` for relative dates without editing it. The three error mappers duplicate about 15 lines each; folding them into one helper is a later cleanup.

## Defaults
- Progress is a real tab; with six tabs iOS moves Ingest and Inbox into "More", so Review keeps its badge visible.
- Home calls both `/home/summary` and `/streak`; only `/streak` has `lastActiveDate` (UTC date) for the "studied today" hint.
- Course stats appear as a compact section at the top of the course screen with a "See all" screen.
- The Knowledge list's "course" filter means subject, because the overview filters by subject (including child subjects).
- The Knowledge list is reached from a toolbar button on the Review tab, so it needs no shared Home or tab edits.
- Bulk move reloads the first page; bulk delete removes rows locally; selection is capped at 200 (server limit).
- The reject reason prompt is an optional sheet with "Skip", shown only when the server returns a feedback id.
- Study-tools entries: a "Study tools" section on Home (Ask, Search notes, Open questions) and a new icon on each topic row opening a topic hub, since topics have no screen today.
- Both chats send the full transcript each turn, matching web and the existing item chat; the composer caps a message at 20,000 characters.
- Notes are written on topics only; open questions default to the open filter.
- No test target exists, so verification is the XcodeGen + xcodebuild build plus the manual checks listed in each plan.

END-OF-REPORT
