# Subject management: create, rename, delete, reorder, merge, categories

## Goal
Covers the single coding task in `.planning/subject-management/todo.md`: from the Courses tab, the learner can add a subject (optionally inside another subject), rename it, change the order of subjects, merge one subject into another, delete a subject, and organise a subject's courses into categories (create, rename, nest categories, and put a course into a category).

Batch B, built first. This plan creates the batch-B Courses hub file (`CourseOrganizeSection.swift`) that course-building adds rows to.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-410`); errors are `{ "error": "<code>" }`, validation failures 400 `invalid_input`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /subjects` | `apps/api/src/router-table.ts:15`, `apps/api/src/subject/subject.controller.ts:22-39` | none | `[Subject]` (`packages/shared/src/subject.ts:4-13`) | none |
| `POST /subjects` | `router-table.ts:16`, `api-server.ts:446`, `subject.controller.ts:41-58` | `{ name, parentId? }` (`subject.ts:17-23`; `kind` defaults to `architecture-mentor`) | 201 `Subject` | 400 `parent_not_found` |
| `PATCH /subjects/:id` | `router-table.ts:196`, `api-server.ts:522`, `subject.controller.ts:60-85` | `{ name }` (`subject.ts:27-31`) | `Subject` | 404, 400 `parent_not_found`/`invalid_parent` |
| `PATCH /subjects/order` | `router-table.ts:195`, `api-server.ts:520`, `subject.controller.ts:87-106` | `{ parentId: String?, orderedIds }` (must list every sibling under that parent, `subject.ts:39-42`) | `{ reordered }` | 400 `invalid_id_set`, `parent_not_found` |
| `DELETE /subjects/:id` | `router-table.ts:194`, `api-server.ts:518`, `subject.controller.ts:108-120` | none | deleted | 404. Deletes all the subject's courses and moves its child subjects up (`apps/api/src/subject/subject.repo.ts:485-510`) |
| `POST /subjects/:id/merge` | `router-table.ts:197`, `api-server.ts:524`, `subject.controller.ts:122-147` | `{ sourceSubjectId }` (`:id` is the subject that stays) | `{ targetSubjectId, sourceSubjectId, curriculaMoved, domainNodesMoved }` (`subject.ts:52-57`) | 404, 400 `self_merge`, `kind_mismatch` |
| `GET /subjects/:id/categories` | `router-table.ts:198-203`, `apps/api/src/subject-category/subject-category.controller.ts:6-11` | none | `[{ id, subjectId, parentId?, name }]` (`packages/shared/src/subject-category.ts:7-14`) | none |
| `POST /subjects/:id/categories` | `router-table.ts:204-209`, `subject-category.controller.ts:17-45` | `{ name, parentId? }` | 201 category | 404 `subject_not_found`, 400 `parent_wrong_subject` |
| `PATCH /subject-categories/:id` | `router-table.ts:211`, `subject-category.controller.ts:47-72` | `{ parentId: String? }` (move) | category | 404 `category_not_found`/`parent_not_found`, 400 `parent_wrong_subject`, `would_create_cycle` |
| `PATCH /subject-categories/:id/name` | `router-table.ts:212`, `subject-category.controller.ts:74-94` | `{ name }` | category | 404 |
| `GET /curricula` | `router-table.ts:214` | none | `[Curriculum]` incl. `categoryId?` (`packages/shared/src/curriculum.ts:36-67`) | none |
| `POST /curricula/:id/move` | `router-table.ts:217`, `api-server.ts:556`, `apps/api/src/curriculum/curriculum.controller.ts:604-633` | `{ targetSubjectId: <same subject>, categoryId: String? }`; `categoryId` is always sent, `null` meaning "no category" (honoured explicitly, `curriculum.ts:311-321`, `apps/api/src/curriculum/curriculum.repo.ts` doc on `moveCurriculumToSubject`) | moved curriculum | 400 `same_subject` (only when `categoryId` is absent), `category_wrong_subject`, `kind_mismatch`; 404 |

`Subject` fields used: `{ id, name, description?, requireSources, kind, modelTier?, parentId?, sortOrder? }`.

## Dropped
- Deleting a category: no route exists (`router-table.ts:198-212` has list, create, move, rename only).
- Changing a subject's AI tier (`modelTier`) and moving a subject under another parent after creation: not in the todo.
- Subject kind choice ("language practice"): not in the todo; new subjects use the server default.
- Reordering courses inside a subject (`PATCH /subjects/:id/curricula/order`, `router-table.ts:213`): not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `SubjectManage*`, `SubjectCategory*`, `CourseOrganize*`:
- `API/SubjectManageModels.swift` (~70 lines): `SubjectManageSubject`, `SubjectManageCreateInput`, `SubjectManageRenameInput`, `SubjectManageOrderInput`, `SubjectManageMergeInput`, `SubjectManageMergeResult`, `SubjectManageCourse { id, subjectId, name, status, categoryId? }`, `SubjectCategory`, `SubjectCategoryCreateInput`, `SubjectCategoryMoveInput`, `SubjectCategoryRenameInput`, `SubjectCategoryCourseMoveInput` (encodes `categoryId` even when nil).
- `API/APIClient+SubjectManage.swift` (~90 lines): `manageSubjects()`, `createManagedSubject(name:parentId:)`, `renameSubject(id:name:)`, `reorderSubjects(parentId:orderedIds:)`, `deleteSubject(id:)`, `mergeSubject(into:from:)`, `subjectCategories(subjectId:)`, `createSubjectCategory(subjectId:name:parentId:)`, `moveSubjectCategory(id:parentId:)`, `renameSubjectCategory(id:name:)`, `organizeCourses()`, `setCourseCategory(courseId:subjectId:categoryId:)`; own `encodedSegment`.
- `SubjectManageModel.swift` (~140 lines), `SubjectManageScreen.swift` (~170 lines), `SubjectManageSheets.swift` (~120 lines: new subject, rename, merge picker).
- `SubjectCategoryModel.swift` (~110 lines), `SubjectCategoryScreen.swift` (~160 lines).
- `CourseOrganizeSection.swift` (~40 lines): batch-B Courses hub, a `Section("Organise")` with the "Manage subjects" row; course-building adds its rows here.

## Screens and behaviour
- Entry: `CourseOrganizeSection(onChange: { Task { await model.load() } })` in the Courses list, below the subject sections. Row "Manage subjects" (`folder.badge.gearshape`) pushes `SubjectManageScreen`; `onChange` runs when it pops after any change so the Courses list reloads.
- `SubjectManageScreen`: subjects as a tree (top-level by `sortOrder`, children indented under their parent). Toolbar "+" opens the new-subject sheet (name, optional "Inside" picker of existing subjects). Each row: tap pushes `SubjectCategoryScreen`; context menu "Rename", "Merge into...", "Delete".
  - Reorder: `EditButton`; `.onMove` within one sibling group sends the full sibling id list with that group's `parentId`. On error, reload to the server order.
  - Rename: sheet with the current name; blank disabled.
  - Merge: picker of other subjects of the same `kind`; confirm "Merge <A> into <B>? All of <A>'s courses move to <B> and <A> is deleted." (destructive). Shows "Moved N courses." `kind_mismatch`: "These subjects are different kinds and can't be merged."
  - Delete: confirm "Delete <name>? Its N courses are deleted too. Subjects inside it move up a level." (destructive; N from `organizeCourses()`).
- `SubjectCategoryScreen` (one subject): categories as a tree, then "Not in a category" with the remaining courses. "+" creates a category (name, optional parent). Category context menu: "Rename", "Move into..." (picker of other categories plus "Top level"; `would_create_cycle`: "A category can't go inside itself."). Each course row has a menu "Put in category" listing categories plus "No category".
- States: spinner, error with "Try again", pull to refresh. All writes disable their buttons while running.

## Shared files
Re-read before editing; one added line via targeted `Edit`.
- `Sources/PostAnkiIOS/CoursesScreen.swift`: in `CoursesScreen`'s `List`, on the line after the closing brace of `ForEach(model.subjects) { ... }` (currently line 46), add `CourseOrganizeSection(onChange: { Task { await model.load() } })`. Batch B's course-editing adds a separate line in `CurriculumDetailScreen` in the same file; no other batch touches it.

## Edge cases
- Deleting or merging a subject the learner was last studying: Home's "Continue studying" may point to a removed course; it already handles load failures.
- Reorder conflicts (another device added a sibling): `invalid_id_set` triggers reload and "The list changed. Try again."
- Subjects with children: delete copy names that children move up.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: create a subject inside another, rename, reorder siblings, merge two test subjects, delete one; create two nested categories, put a course in one, then back to "No category".

## Defaults
- Delete and merge always ask first.
- Category management lives on a per-subject screen, not on the Courses list.
