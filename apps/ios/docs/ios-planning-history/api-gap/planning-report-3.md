# Planning report 3: eleven API-gap features in three batches

This round adds eleven plans. Each one fills a gap where the server has working routes and the iOS app has no screen for them. Every plan sits in its feature folder as `plan.md` next to that folder's `todo.md`. Every plan was checked against `/Users/ikushlianski/webdata/ilya-projects/post-anki`: `apps/api/src/router-table.ts`, the dispatch in `apps/api/src/api-server.ts`, the controllers, and `packages/shared/src`. The app gets no new tab. Each feature uses its own name prefix and its own new files.

## Batches

Batches run in order A, then B, then C. No file is shared between batches, including existing files edited by a single line. Plans inside a batch run in the listed order, because the first plan in each batch creates a "hub" file that later plans in the same batch add rows to.

### Batch A: Home and start of day, sources
Owns these existing files: `HomeScreen.swift`, `PendingReviewScreen.swift`, `KnowledgeItemDetailScreen.swift`. Creates the hub `HomeDailySection.swift`.
1. `.planning/daily-push/plan.md` creates the hub. It also adds `HomeDailySection()` to Home, on the line after the due-cards row.
2. `.planning/search/plan.md` adds a "Search" row to the hub.
3. `.planning/source-library/plan.md` adds two hub rows: "Source library" and "Content inbox".
4. `.planning/notion-import/plan.md` adds an "Import from Notion" row to the hub.
5. `.planning/source-regeneration/plan.md` adds one line inside each source section of the Review tab and one line at the end of the item detail list.

### Batch B: Courses
Owns this existing file: `CoursesScreen.swift`. Creates the hub `CourseOrganizeSection.swift`.
1. `.planning/subject-management/plan.md` creates the hub. It adds one line in the Courses list, after the subject sections.
2. `.planning/course-building/plan.md` adds two hub rows: "New course" and "Courses being built".
3. `.planning/course-editing/plan.md` adds one line in the course screen, after the stats section.

### Batch C: Organise and admin, under Settings
Owns this existing file: `SettingsScreen.swift`. Creates the hub `SettingsToolsSection.swift`.
1. `.planning/domain-maps/plan.md` creates the hub. It adds `SettingsToolsSection()` after the Save/Remove section.
2. `.planning/duplicate-review/plan.md` adds a "Duplicates" row to the hub.
3. `.planning/admin-tools/plan.md` adds an "Admin" row to the hub.

## Edits to existing files (one added line each, re-read before editing)
| File | Batch | Plan | Line added |
|---|---|---|---|
| `Sources/PostAnkiIOS/HomeScreen.swift` | A | daily-push | `HomeDailySection()` after `Section { DueTodayRow(model: dueModel) }` |
| `Sources/PostAnkiIOS/PendingReviewScreen.swift` | A | source-regeneration | `SourceRegenerationRow(sourceId: source.id) { Task { await model.load() } }` after the bits `ForEach` |
| `Sources/PostAnkiIOS/KnowledgeItemDetailScreen.swift` | A | source-regeneration | `MoreVariantsSection(bitId: item.id)` as the last list item |
| `Sources/PostAnkiIOS/CoursesScreen.swift` | B | subject-management | `CourseOrganizeSection(onChange: { Task { await model.load() } })` after the subjects `ForEach` |
| `Sources/PostAnkiIOS/CoursesScreen.swift` | B | course-editing | `CourseEditSection(curriculum: curriculum) { Task { await model.load(curriculumId: curriculum.id) } }` after `CurriculumStatsSection(...)` |
| `Sources/PostAnkiIOS/SettingsScreen.swift` | C | domain-maps | `SettingsToolsSection()` after the Save/Remove section |

## Dropped, with reasons
Missing server routes. These parts were dropped and not invented:
- Showing a knowledge source's full text (source-regeneration). The web app calls `GET /knowledge-sources/:id/text`, but that route is not in `router-table.ts`.
- Choosing the AI model for regeneration. No route lists the allowed models, so the server default is used.
- Accepting or dismissing a content-inbox row (source-library). No route exists, so the inbox is read-only.
- Picking a Notion database from a list (notion-import). No route lists them, so the user pastes the id.
- Deleting a subject category (subject-management). The routes only cover list, create, move and rename.
- Listing earlier comments on modules and topics (course-editing). Only the create routes exist.
- Creating, renaming or deleting knowledge-map areas (domain-maps). No routes exist; the server builds the map.
- Approving or rejecting single sources during course building. `approve-sources` only accepts `{ override }`, so removing a source uses the delete route instead.
- Knowing when generated question variants are ready. There is no status route for this.

Excluded by a rule, or not asked for in the todo:
- Changing admin settings (`PATCH /admin/settings`). The admin tools are read-only.
- Running the auto-defer sweep. It changes data in bulk and is not safe to trigger by hand.
- The `/mcp` and `/electric` routes. They are protocol endpoints, not screens.
- The bot's "still interested?" nudge reply, a subject filter on the daily pick, and quick-test mode for the daily question.
- Several course-building extras: pre-assessment, course merge and reorder, preferred level, and split suggestions or tool actions inside structure turns.
- In subject management: changing a subject's AI tier, moving a subject to a new parent after it exists, picking a subject kind, and reordering courses.
- Moving a topic to another module, and editing a topic's summary or depth.
- Opening a matched knowledge item from search results. Search does not return enough of the item to open its screen.
- Merging duplicate sources. The server only records a decision for these pairs; deleting a source stays in the source library.

## Destructive actions (confirm dialog required)
- Subject: delete (this also deletes its courses) and merge.
- Duplicate-subject accept, which merges the two subjects.
- Delete a source, in the source library and during course building.
- Delete a module or a topic.
- Merge two knowledge-map areas.
- Regenerate a source's items. This replaces the pending items.
- Accept a "what to learn next" recommendation. This creates a course.
- Every admin scan trigger. The tagging and business-education distill triggers use destructive styling because they change data.
- Every paid AI trigger outside admin also asks first. This covers priority review, document scan, recommendations, course-area mapping and duplicate scans.

## Defaults chosen (no questions asked)
- Placement:
  - The start-of-day screen is a card at the top of Home, not a modal that pops up.
  - Search sits in a Home row, not in the toolbar.
  - Maps, duplicates and admin live under Settings > Tools.
- Polling: about every 3 seconds for regeneration and structure turns, 4 seconds while sources are gathered. Polling stops after 5 minutes for regeneration and 10 minutes for course building.
- Lists support pull to refresh. Offline errors use the existing `StudyToolsError` message. Nothing is queued while offline.
- Only one way to start a course is chosen per course, so the server's conflict errors cannot happen from the app.

## Facts and assumptions
- **Fact:** every route, request shape, response shape and error code in the plans is cited with server `file:line`. These were read during planning.
- **Fact:** there is no iOS test target. Verification for each plan is `xcodegen generate` plus a simulator `xcodebuild` and the manual steps listed in that plan.
- **Fact:** a planned name-prefix check against the existing Swift sources found no collisions.
- **Assumption:** the line numbers given for edits to existing files (Home line 46, Courses line 46 and line 94, Settings line 90) are from the current `main`. Each edit is anchored on the quoted code, not on the number.
- **To verify:** in admin-tools, the exact paths of seven knowledge-item scan triggers. Their handlers are cited, but the regex router entries for them were not captured during planning.

END-OF-REPORT
