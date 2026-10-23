# Course building: create, sources, research, structure turns, confirm

## Goal
Covers the single coding task in `.planning/course-building/todo.md`: start a new course from links, from a research topic, from a document link, or from pasted material; approve or add sources; shape the course's modules and topics through a back-and-forth with the assistant; confirm the structure, choose which topics to study, and confirm the course so it becomes studyable. Failed builds can be retried.

Batch B, built second. Adds rows to `CourseOrganizeSection.swift` (created by subject-management).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/subject-management/plan.md`. All controller lines are in `apps/api/src/curriculum/curriculum.controller.ts` unless noted; shapes in `packages/shared/src/curriculum.ts`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /curricula` | `apps/api/src/router-table.ts:215`, `apps/api/src/api-server.ts:538`, ctrl `:76-275` | `{ subjectId, name, description?, categoryId?, ...one mode }`; modes: `sources: [{ kind: "link", value, title? }]`, `researchTopic`, `docUrl`, `pastedMaterial` (`curriculum.ts:71-92`) | 202 `Curriculum` (`curriculum.ts:36-67`) | 404 `subject_not_found`; 400 `sources_required`, `doc_url_and_research_topic_conflict`, `research_and_sources_conflict`, `pasted_material_and_research_conflict`, `pasted_material_and_sources_conflict`, `category_wrong_subject` |
| `GET /curricula/:id` | ctrl `:635-647` | none | detail: curriculum (`status`, `origin`), `sources: [{ id, kind, value, title?, approvalStatus, discoveryTier? }]`, modules with topics (`included`), `hasStructureDraftAttempt` (`curriculum.ts:126-156`) | 404 |
| `POST /curricula/:id/approve-sources` | `router-table.ts:224`, ctrl `:276-329` | `{ override?: Bool }` (`curriculum.ts:101-103`); `override: true` proceeds even when no source is approvable (ctrl `:305-308`) | 202, status becomes `shaping_structure` | 409 `not_awaiting_approval`, 400 `no_approved_sources` |
| `DELETE /sources/:id` | `router-table.ts:229`, ctrl `:487-499` | none | `{ id, deleted: true }` | 404 |
| `POST /curricula/:id/sources` | `router-table.ts:220`, ctrl `:699-762` | `{ curriculumId, sources: [{ kind: "link", value, title? }] }` (`curriculum.ts:94-97`, min 1) | 200 (queued for approval) or 202 (curating) | 409 `shaping_structure_in_progress` |
| `GET /curricula/:id/structure-turns` | `router-table.ts:225`, ctrl `:331-343` | none | `[StructureTurn]` (`curriculum.ts:253-268`) | 404 |
| `POST /curricula/:id/structure-turns` | `router-table.ts:226`, ctrl `:345-397` | `{ message (max 20000), researchGapLabels? }` (`curriculum.ts:272-283`) | turns | 409 `not_shaping_structure`, `turn_in_progress`, `turn_limit_reached` (40 turns) |
| `POST /curricula/:id/resolve-research-candidates` | `router-table.ts:227`, ctrl `:399-451` | `{ approvedCandidateIds }` (`curriculum.ts:285-291`) | turns | 409 |
| `POST /curricula/:id/confirm-structure` | `router-table.ts:228`, ctrl `:453-485` | no body | status becomes `ready`; topics start not included | 409 `not_shaping_structure`, 400 `no_structure_snapshot` |
| `PATCH /topics/:id` | `router-table.ts:297`, `apps/api/src/topic/topic.controller.ts:76-128` | `{ included: Bool }` | topic | 404 |
| `POST /curricula/:id/confirm` | `router-table.ts:218`, ctrl `:649-683` | no body | confirmed curriculum | 409 `not_ready`, `not_studyable` (needs an included topic or an empty module) |
| `POST /curricula/:id/retry-research` | `router-table.ts:222`, ctrl `:501-527` | none | 202 | 409 `already_curating` |
| `POST /curricula/:id/retry-structure-draft` | `router-table.ts:223`, ctrl `:529-561` | none | 202 | 409 `not_failed` |
| `POST /curricula/:id/reparse` | `router-table.ts:221`, ctrl `:764-814` | none | 202 | 409 |

`StructureTurn`: `{ id, role: user|assistant, message, structureSnapshot?: { modules: [{ title, level, topics: [{ title, summary?, suggestedDepth, sourceUrl? }] }], strictOrder? }, status: pending|complete|failed, pendingResearchCandidates: [{ id, label, title, value, approvalStatus }], createdAt }`. Status values: `draft, curating, awaiting_source_approval, shaping_structure, ready, confirmed, failed` (`curriculum.ts:20-28`).

## Dropped
- Approving or rejecting single sources: `approve-sources` only takes `{ override }`; no per-source approval route exists. Removing an unwanted source uses the delete call instead.
- Split suggestions and tool actions inside a turn (`splitSuggestion`, `toolActions`): shown on web as extra controls; the app shows the turn text and snapshot only. Not in the todo's list.
- Pre-assessment (`complete-pre-assessment`, `router-table.ts:219`), course merge (`:216`), course reorder (`:213`), preferred level and placing a course on a domain node at creation: not in the todo.
- Renaming or deleting a whole course: not in this todo; course-editing covers modules and topics only.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `CourseBuild*`:
- `API/CourseBuildModels.swift` (~120 lines): `CourseBuildCreateInput` (omits nil keys), `CourseBuildSourceInput`, `CourseBuildCourse`, `CourseBuildDetail`, `CourseBuildSource`, `CourseBuildModule`, `CourseBuildTopic { id, title, included }`, `CourseBuildTurn`, `CourseBuildSnapshot`, `CourseBuildCandidate`, `CourseBuildTurnInput`, `CourseBuildApproveInput`, `CourseBuildIncludeInput`.
- `API/APIClient+CourseBuild.swift` (~110 lines): one function per call above, all prefixed `courseBuild...`; own `encodedSegment`.
- `CourseBuildCreateModel.swift` (~110 lines), `CourseBuildCreateScreen.swift` (~160 lines).
- `CourseBuildModel.swift` (~170 lines: load, polling, actions), `CourseBuildScreen.swift` (~150 lines: status-driven body), `CourseBuildSourcesSection.swift` (~120 lines), `CourseBuildStructureSection.swift` (~170 lines: turns, snapshot, candidates, composer), `CourseBuildTopicPickSection.swift` (~100 lines).
- `CourseBuildListScreen.swift` (~80 lines): courses not yet confirmed.

Read-only reuse: `APIClient.listSubjects()`, `APIClient.listCurricula()`, `CurriculumDetailScreen(curriculum:)`, `StudyToolsError`; categories via `APIClient.subjectCategories(subjectId:)` from subject-management (same batch, built earlier).

## Screens and behaviour
- Entry: two rows in `CourseOrganizeSection`: "New course" (`plus.rectangle.on.folder`) pushes `CourseBuildCreateScreen`; "Courses being built" (`hammer`) pushes `CourseBuildListScreen` (courses from `listCurricula()` whose status is not `confirmed`, with a status label), each pushing `CourseBuildScreen`.
- `CourseBuildCreateScreen` (Form): subject picker, optional category picker, name, optional description, and a mode picker "Links" / "Research a topic" / "Document link" / "Paste material". Only the chosen mode's field is sent, so conflict errors cannot arise; "Links" is a list of URL fields (at least one). Create pushes `CourseBuildScreen` for the new id.
- `CourseBuildScreen` loads the detail and switches on status:
  - `draft`/`curating`: "Gathering sources..." spinner; polls every 4 seconds.
  - `awaiting_source_approval`: `CourseBuildSourcesSection` lists sources with their `approvalStatus` label, swipe "Remove" (confirm, then `DELETE /sources/:id`; there is no per-source approve route), "Add link" (posts `/sources`), and "Approve sources" (sends `{}`). On `no_approved_sources`: "None of these sources can be used." with "Continue without sources" (sends `{ override: true }`).
  - `shaping_structure`: `CourseBuildStructureSection` shows turns as a chat (user right, assistant left), the latest snapshot as an outline (modules, topics with depth), research candidates with checkboxes and "Use selected", a message field (send disabled while a turn is pending), and "Confirm structure". Polls every 3 seconds while the last assistant turn is `pending`. `turn_limit_reached`: "This course has reached 40 rounds. Confirm the structure or start again."
  - `ready`: `CourseBuildTopicPickSection` lists modules and topics with include toggles (each toggle sends `PATCH /topics/:id`), "Include all", and "Confirm course". `not_studyable`: "Include at least one topic." On success, push `CurriculumDetailScreen`.
  - `failed`: "Building this course failed." with "Try again" choosing the retry: `origin == sources` uses reparse; else `hasStructureDraftAttempt` uses retry-structure-draft; else retry-research.
  - `confirmed`: link to `CurriculumDetailScreen`.
- Polling is a `Task` cancelled on disappear; stops after 10 minutes with "Still working. Pull to refresh."

## Shared files
None outside batch B. `CourseOrganizeSection.swift` (batch B): two rows.

## Edge cases
- 409 `shaping_structure_in_progress` when adding a source: "Wait for the current step to finish."
- 409 `turn_in_progress`: keep polling instead of erroring.
- A user turn that fails (`status: failed`): show "That message failed." and allow resending.
- Leaving and returning: everything is reloaded from the server; nothing is held locally.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: build one course from a research topic end to end (approve sources, two structure turns, confirm structure, include topics, confirm) and see it on the Courses tab; create a links course and approve its sources.

## Defaults
- One mode per course, chosen up front.
- Polling every 3-4 seconds, stop after 10 minutes.
- Topic include toggles save one at a time.
