# Learning list and learning paths

## Goal
Covers the single coding task in `.planning/learning-list/todo.md`: save a link (article or video) to the learning list, see what the app recommends doing with it, approve or decline that, pick a destination for parked items, and follow role-based learning paths (start one from a template, see step progress, abandon it). Mirrors web `apps/web/src/routes/learning-list.tsx`, `apps/web/src/routes/learning-paths.tsx` and `apps/web/src/routes/learning-paths_.$pathId.tsx`.

Batch 2, built first (creates the batch-2 Home section).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All behind the bearer check (`apps/api/src/api-server.ts:407-408`, 401 `unauthorized`); errors `{ error, message? }`; validation 400 `invalid_input`. Dispatch: `api-server.ts:800-827`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /learning-list-items` | `apps/api/src/router-table.ts:626`, `apps/api/src/learning-list/learning-list.controller.ts:38-69` | `{ url, kind: "article"|"video" (default article), pastedDescription?, subjectId, subSubjectNodeId? }` (`packages/shared/src/learning-list.ts:141`) | **201** `LearningListItem` | 400 `video_requires_description` / `source_blocked`, 502 `source_unreachable`, 422 `source_empty`, 502 `classification_failed` |
| `GET /learning-list-items?status=` | `router-table.ts:627`, `learning-list.controller.ts:71-95` | optional status | `[LearningListItem]` newest first | 400 `invalid_status` |
| `GET /learning-list-items/:id` | `router-table.ts:654`, `learning-list.controller.ts:97-116` | none | `LearningListItem` | 404 |
| `PATCH /learning-list-items/:id/recommendation` | `router-table.ts:630`, `learning-list.controller.ts:118-151` | `{ decision: "approve"|"decline" }` (`learning-list.ts:151`) | approve: `{ item, curriculumId }`; decline: `LearningListItem` | 404, 409 `not_awaiting_decision`, 400 `subject_not_found` / `extend_target_missing` / `extend_target_busy` / `fold_in_area_missing` |
| `PATCH /learning-list-items/:id/destination` | `router-table.ts:636`, `learning-list.controller.ts:175-212` | `{ destination: "mini_course"|"fold_in" }` (`learning-list.ts:163`) | `{ item, curriculumId }` | 404, 409 `not_parked` / `not_awaiting_decision` |
| `POST /learning-list-items/:id/classification` | `router-table.ts:642`, `learning-list.controller.ts:214` | `{ subjectId, subSubjectNodeId? }` (`learning-list.ts:171`) | `LearningListItem` | 404, 409 `not_capturable`, 422 `missing_url`, source errors as capture, 502 `classification_failed` |
| `GET /role-templates` | `router-table.ts:658`, `apps/api/src/learning-path/learning-path.controller.ts:24` | none | `[{ id, name, targetRoleLabel, targets: [{ domainNodeId, name }] }]` (`packages/shared/src/learning-path.ts:58-74`) | none |
| `POST /learning-paths` | `router-table.ts:659`, `learning-path.controller.ts:56-88` | `{ roleTemplateId }` (`learning-path.ts:78`) | **201** `{ path, steps }` | 404 `role_template_not_found` / `subject_not_found`, 422 `unresolved_target` |
| `GET /learning-paths?status=active` | `router-table.ts:660`, `learning-path.controller.ts:90-97` | `status=active` filters, anything else returns all | `[LearningPath]` (no defined order) | none |
| `GET /learning-paths/:id` | `router-table.ts:669`, `learning-path.controller.ts:99-125` | none | `LearningPathDetail` (`learning-path.ts:49`) | 404 |
| `PATCH /learning-paths/:id` | `router-table.ts:675`, `learning-path.controller.ts:127-147` | `{ status: "abandoned" }` (`learning-path.ts:84`) | `LearningPath` | 400, 404 |

Shapes:
- `LearningListItem` (`learning-list.ts:116`): `{ id, url?, rawText?, title?, kind, verdict?, recommendation: Recommendation?, status: "captured"|"classifying"|"classified"|"folded_in"|"parked"|"course_created"|"declined"|"unreachable", curriculumId?, questionsGenerated, questionCeiling?, createdAt, updatedAt }`; list and get add `liveness?` (ignored).
- `Recommendation` (`learning-list.ts:77`): `{ verdict, reasons: [String], destination: "fold_in"|"mini_course"|"extend_curriculum"|"park", areaName?, subjectId, partCount, existingCurriculumMatch: { curriculumId, title }? }` (other fields ignored).
- Awaiting a decision = `status == "classified"` and destination is mini_course, extend_curriculum or fold_in.
- `LearningPath` (`learning-path.ts:8`): `{ id, name, targetRoleLabel, status: "draft"|"active"|"completed"|"abandoned", createdAt, startedAt?, completedAt? }`. Detail: `{ path, steps: [{ id, pathId, domainNodeId, order, createdAt }], progress: { overallStatus, steps: [{ domainNodeId, progress: { topicsIncluded, topicsMastered, percent }, status }] }, nextStepDomainNodeId? }` (`learning-path.ts:20-49`).

## Dropped
- `POST /learning-list-items/:id/nudge-responses` (`router-table.ts:648`): nudge replies come from bot reminders; not in the todo.
- `GET /learning-paths/:id/steps/:stepId/push` (`router-table.ts:663`): answering needs the topic probe answer flow owned by batch 1's study-sessions plan; a later ticket can reuse it.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `LearningList*` and `LearningPath*`:
- `API/LearningListModels.swift` (~90 lines), `API/APIClient+LearningList.swift` (~70 lines, own file-private path helpers).
- `LearningListModel.swift` (~120 lines), `LearningListScreen.swift` (~140 lines), `LearningListItemScreen.swift` (~150 lines), `CaptureLearningItemSheet.swift` (~110 lines).
- `API/LearningPathModels.swift` (~60 lines), `API/APIClient+LearningPaths.swift` (~50 lines).
- `LearningPathsModel.swift` (~90 lines), `LearningPathsScreen.swift` (~120 lines), `LearningPathDetailScreen.swift` (~130 lines).
- `HomePracticeSection.swift` (~30 lines): batch-2 Home section `Section("Learn more")`, first rows "Learning list" (`tray.full`) and "Learning paths" (`map`).

## Screens and behaviour
### Learning list
- List grouped "Needs your decision" (awaiting), "Parked", "Working on it" (captured/classifying), "Done" (folded_in, course_created, declined, unreachable). Row: title or URL host, kind icon, status caption.
- Toolbar "+" opens `CaptureLearningItemSheet`: URL field, kind picker (Article / Video), "What is it about?" field shown and required for video, subject picker (from `listSubjects()`, read-only reuse). Save posts and shows "Reading the link..." (can take tens of seconds). Errors by code: video_requires_description "Add a short description for videos.", source_blocked "That site blocks reading.", source_unreachable "Couldn't reach that link.", source_empty "That page had nothing to read." (item saved; list refreshes), classification_failed "Saved, but couldn't sort it yet."
- Item screen: recommendation destination in plain words ("Add to <area>", "Make a short course", "Extend <course title>", "Park for later"), reasons as bullets, part count for series. Awaiting items show "Approve" and "Decline". Parked items show "Make a short course" / "Add to an existing area". Captured items with a URL show "Sort it now" (classification with the item's subject).
- Approve or destination results with a `curriculumId` show "Open course", pushing `CurriculumDetailScreen` (read-only reuse, after loading the `Curriculum` via `listCurricula()`).
- 409 codes reload the item ("This item changed. Refreshed."). 400 extend codes show "That course can't be extended right now."
- States: spinner, error with "Try again", empty "Nothing saved yet. Tap + to add a link.", pull to refresh. Items in captured/classifying refresh on pull only (no polling).

### Learning paths
- List: active paths first, then the rest; row name, role label, status. Toolbar "+" shows templates (name, role, target count) and "Start" posts; 422 `unresolved_target` shows "This template doesn't match your areas yet."
- Detail: overall status, steps by `order`, each with the template target name (matched by `domainNodeId`, fallback "Untitled step"), status and "mastered of included topics (percent%)". The next step is marked "Next". "Abandon path" (confirm) PATCHes; then read-only.
- Spinner, error with "Try again", empty "No learning paths yet.", pull to refresh on both.

## Shared files
Re-read before editing; targeted `Edit`.
- `HomeScreen.swift`: one line, `HomePracticeSection()` on the line directly before `HomeStudyToolsSection()`. Nothing else.
- `HomePracticeSection.swift` is batch-2-owned; batch 1 never touches it.

## Edge cases
- Duplicate submit: Save disabled while posting.
- Item without a title: show URL host, then raw text.
- Paths list has no server order: sort by `createdAt` descending within each group.
- Offline: offline message, nothing queued.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: save an article link on iOS, see its recommendation, approve it and open the new course; the item shows on web's learning list with the same status; start a path from a template and see it on web's learning paths page; abandon it.

## Defaults
- Server error codes map to app-written messages (the client only decodes `error`), close to `apps/web/src/learning-list/capture-error.ts`.
- No polling for classifying items; pull to refresh.
- Step practice deferred (see Dropped).
