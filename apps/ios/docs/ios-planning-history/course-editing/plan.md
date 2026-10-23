# Course editing: modules and topics

## Goal
Covers the single coding task in `.planning/course-editing/todo.md`: inside a course, the learner can add, rename, reorder and delete modules and topics, and leave a comment on a module or topic (feedback the server feeds into later course work).

Batch B, built third (last).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/subject-management/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /curricula/:id/modules` | `apps/api/src/router-table.ts:252`, `apps/api/src/module/module.controller.ts:15-33` | `{ title }` | 201 Module | 404 |
| `PATCH /modules/:id` | `router-table.ts:272`, `module.controller.ts:35-55` | `{ title }` | Module | 404 |
| `DELETE /modules/:id` | `router-table.ts:273`, `module.controller.ts:57-69` | none | deleted (removes its topics) | 404 |
| `PATCH /curricula/:id/modules/order` | `router-table.ts:251`, `module.controller.ts:71-91` | `{ orderedIds }` (all module ids, min 1) | reordered | 400 `invalid_id_set` |
| `POST /modules/:id/topics` | `router-table.ts:271`, `apps/api/src/topic/topic.controller.ts:51-74` | `{ title }` (`summary`, `suggestedDepth` optional, not sent) | 201 Topic | 404 |
| `PATCH /topics/:id` | `router-table.ts:297`, `topic.controller.ts:76-128` | `{ title }` | Topic | 404 |
| `DELETE /topics/:id` | `router-table.ts:298`, `topic.controller.ts:130-142` | none | deleted | 404 |
| `PATCH /modules/:id/topics/order` | `router-table.ts:270`, `topic.controller.ts:144-158` | `{ orderedIds }` (all the module's topic ids; the path id is not checked) | reordered | 400 `invalid_id_set` |
| `POST /modules/:id/comments` | `router-table.ts:274`, `apps/api/src/node-feedback/node-feedback.controller.ts:9-33` | `{ comment }` | 201 `{ id, nodeType, nodeId, comment, createdAt }` | 404 |
| `POST /topics/:id/comments` | `router-table.ts:277`, `node-feedback.controller.ts:35-59` | `{ comment }` | 201 same shape | 404 |

The current modules and topics come from the existing `APIClient.getCurriculumDetail(_:)` (read-only reuse).

## Dropped
- Showing earlier comments: no route lists comments; the app confirms "Comment saved." only.
- Moving a topic to another module: not in the todo.
- Editing a topic's summary or depth: not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `CourseEdit*`:
- `API/CourseEditModels.swift` (~40 lines): `CourseEditTitleInput`, `CourseEditOrderInput`, `CourseEditCommentInput`, `CourseEditComment`, `CourseEditCreated { id }`.
- `API/APIClient+CourseEdit.swift` (~80 lines): `courseEditAddModule`, `courseEditRenameModule`, `courseEditDeleteModule`, `courseEditReorderModules`, `courseEditAddTopic`, `courseEditRenameTopic`, `courseEditDeleteTopic`, `courseEditReorderTopics`, `courseEditCommentModule`, `courseEditCommentTopic`; own `encodedSegment`.
- `CourseEditModel.swift` (~140 lines), `CourseEditScreen.swift` (~170 lines), `CourseEditSheets.swift` (~100 lines: title sheet, comment sheet), `CourseEditSection.swift` (~30 lines: the entry row).

## Screens and behaviour
- Entry: `CourseEditSection(curriculum: curriculum) { Task { await model.load(curriculumId: curriculum.id) } }` in the course screen, right after the stats section: one row "Edit course structure" (`pencil`) pushing `CourseEditScreen`; the closure reloads the course when the editor closes.
- `CourseEditScreen`: one section per module with its topics; `EditButton` in the toolbar.
  - Reorder modules: a "Modules" order mode (toggle in toolbar) shows module titles only with `.onMove`, sending all module ids. Reorder topics: `.onMove` inside a module section, sending all that module's topic ids. On error, reload.
  - Add: toolbar "Add module"; each module section ends with "Add topic". Both open the title sheet.
  - Module header menu and topic context menu: "Rename", "Comment", "Delete".
  - Delete module: confirm "Delete <module> and its N topics?" (destructive). Delete topic: confirm "Delete <topic>? Its study history in this course is removed." (destructive).
  - Comment sheet: multi-line field; "Send" posts and shows "Comment saved."
- States: spinner, error with "Try again", pull to refresh; writes disable their controls while running.

## Shared files
Re-read before editing; one added line via targeted `Edit`.
- `Sources/PostAnkiIOS/CoursesScreen.swift`: in `CurriculumDetailScreen`'s `List`, on the line after the closing `)` of `CurriculumStatsSection(...)` (currently line 94), add `CourseEditSection(curriculum: curriculum) { Task { await model.load(curriculumId: curriculum.id) } }`. Subject-management adds a different line in `CoursesScreen` in the same file, earlier in batch B; no other batch touches this file.

## Edge cases
- Deleting the module or topic currently open elsewhere (another tab): those screens already show load errors.
- Reorder with a list that changed on another device: `invalid_id_set` reloads and says "The list changed. Try again."
- Empty course (no modules): shows "No modules yet" with "Add module".

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: add a module and two topics, rename one, reorder both levels, comment on a topic, delete a topic and a module; the course screen reflects each change after closing the editor.

## Defaults
- Every delete asks first; adds and renames do not.
- Editing lives on its own screen so the study view stays uncluttered.
