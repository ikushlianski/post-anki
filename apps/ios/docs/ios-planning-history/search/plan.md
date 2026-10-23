# Search: everything, and topics and modules

## Goal
Covers the single coding task in `.planning/search/todo.md`: one search screen where the learner types a word and finds matching subjects, courses and topics ("Everything"), or a ranked list of topics, modules and knowledge items with their tags ("Topics and modules"), then jumps straight to what they found.

Batch A, built second. Adds one row to `HomeDailySection.swift` (created by daily-push).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/daily-push/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /search?q=<text>` | `apps/api/src/router-table.ts:312`, `apps/api/src/api-server.ts:651-652`, `apps/api/src/search/search.controller.ts:16-40` | query `q`; blank returns empty lists (`search.controller.ts:20-25`, trim only, `packages/core/src/note/search-query.ts`) | `{ subjects: [{ id, label }], curricula: [{ id, label }], topics: [{ id, label, curriculumId }] }` (`packages/shared/src/search.ts:3-20`) | none |
| `GET /search/topics-modules?q=<text>&limit=20` | `router-table.ts:313`, `api-server.ts:653-658`, `search.controller.ts:42-82` | `q`; `limit` default 10, capped at 50 (`search.controller.ts:54-58`) | `[{ id, kind: "topic"|"module"|"bit", title, curriculumId?, curriculumName?, rank, tags: [{ id, name }] }]`, highest rank first (`search.ts:31-39`) | none |

## Dropped
- Nothing in the todo is unsupported. Opening a matched knowledge item is not possible: the item screen needs the full overview row, which search does not return, so bit results are shown but not tappable.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `GlobalSearch*`:
- `API/GlobalSearchModels.swift` (~45 lines): `GlobalSearchResponse`, `GlobalSearchItem { id; label }`, `GlobalSearchTopicItem { id; label; curriculumId }`, `GlobalSearchRankedResult`, `GlobalSearchTag`.
- `API/APIClient+GlobalSearch.swift` (~40 lines): `globalSearch(query:)`, `searchTopicsAndModules(query:limit:)`. Builds the query with `URLComponents`/`URLQueryItem` (own file-private helper, same approach as `API/APIClient+KnowledgeManage.swift:10-14,71`).
- `GlobalSearchModel.swift` (~110 lines), `GlobalSearchScreen.swift` (~150 lines), `GlobalSearchSubjectScreen.swift` (~60 lines).

Read-only reuse: `APIClient.listCurricula()`, `APIClient.getCurriculumDetail(_:)`, `CurriculumDetailScreen(curriculum:)`, `TopicStudyScreen(topic:)`, `StudyToolsError`.

## Screens and behaviour
- Entry: row "Search" (`magnifyingglass`) in `HomeDailySection`'s "Find and import" section, pushing `GlobalSearchScreen`. The section is created by daily-push; if it holds no rows yet, this plan adds the `Section("Find and import")` wrapper with this first row (all inside the batch-A file).
- `GlobalSearchScreen`: `.searchable` field, segmented picker "Everything" / "Topics and modules". Typing debounces 300 ms; each new query cancels the previous task; a blank query clears results without a call.
  - Everything: sections "Subjects", "Courses", "Topics" with labels. Subject tap pushes `GlobalSearchSubjectScreen` (courses of that subject from `listCurricula()` filtered by `subjectId`, each pushing `CurriculumDetailScreen`). Course tap finds the `Curriculum` in `listCurricula()` and pushes `CurriculumDetailScreen`. Topic tap loads `getCurriculumDetail(curriculumId)`, finds the `Topic` and pushes `TopicStudyScreen`.
  - Topics and modules (limit 20): rows with a kind icon (topic `book`, module `square.stack`, item `text.alignleft`), title, course name, tag chips. Topic rows open the topic as above; module rows open their course; item rows are not tappable.
  - Lookups happen only on tap, cached in the model for the screen's lifetime. A missing course or topic shows "Couldn't open this. It may have been removed."
- States: "Type to search" before a query, spinner while loading, "No matches for '<q>'" when every list is empty, error line with "Try again".

## Shared files
None outside batch A. `HomeDailySection.swift` (batch A): one row.

## Edge cases
- Results arriving for an older query are ignored (compare to the current query before assigning).
- Very long queries are sent as typed; the server trims.
- Offline: offline message, results kept from the last successful query.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: search a course name and open it; switch to "Topics and modules", search a tag name and open a topic.

## Defaults
- Debounce 300 ms, ranked limit 20.
- Search lives as a Home row, not a toolbar button, to keep Home's toolbar untouched.
