# Lectures and study materials for a topic

## Goal
Covers the single coding task in `.planning/lectures/todo.md`: read a topic's compiled lecture, compile one when missing (finding and approving sources first when the course has none), and request a worked example or an analogy. Mirrors web `apps/web/src/curriculum/lecture-panel.tsx` ("Compile lecture", "Find lecture sources", "Retry compile") and the study-material buttons ("Request a worked example", "Request an analogy").

Batch 1, built third (after quiz-sessions created `TopicStudyModesSection.swift`).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/quiz-sessions/plan.md`. Dispatch for all rows: `apps/api/src/api-server.ts:730-739` (lecture) and `api-server.ts:888-891` (study materials).

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /topics/:id/lecture` | `apps/api/src/router-table.ts:452`, `apps/api/src/lecture/lecture.controller.ts:99-111` | none | `Lecture` (`packages/shared/src/lecture.ts:36`) | 404 `not_found` when the topic has no lecture yet (also when the topic is missing) |
| `POST /topics/:id/lecture` | `router-table.ts:446`, `lecture.controller.ts:68-97` | no body | **202** `Lecture` with `status: "generating"`; compiles in the background | 404 `not_found`, 400 `no_approved_sources` (course has no sources of its own and no approved candidates) |
| `POST /topics/:id/lecture/sources` | `router-table.ts:428`, `lecture.controller.ts:15-27` | no body | **201** `[LectureSourceCandidate]`; runs a model call inline (slow, may 500) | 404 |
| `GET /topics/:id/lecture/sources` | `router-table.ts:434`, `lecture.controller.ts:29-41` | none | `[LectureSourceCandidate]` newest first | 404 |
| `PATCH /lecture-source-candidates/:id` | `router-table.ts:440`, `lecture.controller.ts:43-66` | `{ reviewStatus: "approved"|"rejected" }` (`lecture.ts:60`) | `LectureSourceCandidate` | 400, 404 |
| `POST /topics/:id/study-materials` | `router-table.ts:689`, `apps/api/src/study-material/study-material.controller.ts:9-35` | `{ kind: "worked_example"|"analogy" }` (`packages/shared/src/study-material.ts:31`) | **202** `StudyMaterial` with `status: "generating"` | 400, 404 |
| `GET /topics/:id/study-materials` | `router-table.ts:695`, `study-material.controller.ts:37-50` | none | `[StudyMaterial]` newest first | 404 |

Shapes:
- `Lecture`: `{ id, topicId, title, status: "generating"|"ready"|"failed", createdAt, sections: [{ id, lectureId, order, heading, body }], citations: [{ id, lectureId, title, url }] }` (`lecture.ts:17,27,36`).
- `LectureSourceCandidate` (`lecture.ts:48`): `{ id, topicId, title, url, whySelected, reviewStatus: "pending"|"approved"|"rejected", createdAt }`.
- `StudyMaterial` (`study-material.ts:18`): `{ id, topicId, kind, status, body: String?, citations: [{ title, url }], failureReason: String?, createdAt }`.

## Dropped
- `GET/POST /topics/:id/cards` (flashcard generation, nearby routes): not in the todo.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/LectureModels.swift` (~60 lines): `Lecture`, `LectureSection`, `LectureCitation`, `LectureSourceCandidate`, `ReviewLectureSourceInput`, `StudyMaterial`, `StudyMaterialCitation`, `RequestStudyMaterialInput`.
- `API/APIClient+Lectures.swift` (~60 lines): `lecture(topicId:)`, `compileLecture(topicId:)`, `findLectureSources(topicId:)`, `lectureSources(topicId:)`, `reviewLectureSource(id:status:)`, `studyMaterials(topicId:)`, `requestStudyMaterial(topicId:kind:)`. Own file-private path helpers.
- `LectureModel.swift` (~130 lines): lecture, sources and polling.
- `LectureScreen.swift` (~170 lines): lecture reader plus compile/sources states.
- `LectureSourcesSection.swift` (~70 lines): source review rows.
- `StudyMaterialsModel.swift` (~80 lines), `StudyMaterialsSection.swift` (~90 lines).

## Screens and behaviour

### Entry
- `TopicStudyModesSection` (batch-1 file): add row "Lecture and examples" (`book`) pushing `LectureScreen(topic:)`, below the quiz rows.

### Lecture (`LectureModel`, `LectureScreen`)
- `@MainActor @Observable final class LectureModel`: `lecture: Lecture?`, `sources: [LectureSourceCandidate]`, `needsSources: Bool`, `isLoading`, `isCompiling`, `isFindingSources`, `errorMessage`, polling `Task`.
- `load()`: GET lecture and GET study materials in parallel (`async let`). 404 on the lecture means "none yet", not an error (the error mapper only treats 404 as missing-topic on the other calls).
- No lecture: "No lecture for this topic yet." with "Compile lecture".
- Compile: POST; 202 sets `lecture` and starts polling GET every 2 s (web's interval) while `status == "generating"`; shows "Compiling lecture..." with a spinner. Polling stops on `ready`/`failed`, on leaving the screen (`.task` cancellation), or after 5 minutes ("Still working. Pull to refresh later.").
- 400 `no_approved_sources`: sets `needsSources`, loads candidates, shows `LectureSourcesSection` with copy "This course has no sources yet. Find and approve some, then compile."
- `failed`: "Compiling failed." with "Retry compile" and the sources section.
- Ready: title, sections in `order` with headings and body text (`Text(.init(markdown))` with plain fallback, same approach as notes), then "Sources" with citation links (`Link`).
- Toolbar menu "Recompile" (POST again) when a lecture exists.

### Sources (`LectureSourcesSection`)
- "Find lecture sources" button (POST, can take ~30 s, spinner "Finding sources...", button disabled meanwhile).
- Rows: title as link, `whySelected` caption, status; pending rows show "Approve" / "Reject" buttons; changes update the row in place. "Compile lecture" re-enabled once one is approved.
- Empty after a find: "No sources found. Try again later."

### Worked examples and analogies (`StudyMaterialsModel`, `StudyMaterialsSection`)
- Shown under the lecture on the same screen in `Section("Examples")`.
- Buttons "Request a worked example" and "Request an analogy". Each POST inserts the generating item at the top; poll the list every 2 s while any item is `generating` (same cap and cancellation).
- Rows: kind label ("Worked example" / "Analogy"), body as markdown, citations as links; `failed` shows `failureReason` or "Couldn't generate this one."; empty: "No examples yet."

### States
- First load spinner; failure `ContentUnavailableView` with "Try again"; pull to refresh reloads lecture, sources (only when shown) and materials.
- Offline: URLError maps to "You appear to be offline. Try again." (feature-local mapper mirroring `StudyToolsError`).

## Shared files
Re-read before editing; targeted `Edit`.
- `TopicStudyModesSection.swift` (batch 1): one `NavigationLink` row.
- No other existing file changes.

## Edge cases
- Two quick taps on Compile: button disabled while `isCompiling` or `status == "generating"`.
- A lecture generating from another device: the first GET shows `generating` and starts polling.
- Long lectures: one `List` with lazy rows, no custom scroll view.
- Citation URL that does not parse: shown as plain text.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: on a topic of a course with sources, Compile and watch it switch to the lecture; on a course without sources, see the sources prompt, find, approve one, compile; request an analogy and see it appear; the same lecture and analogy show on web.

## Defaults
- Lecture and examples share one screen, one topic hub row.
- Poll interval 2 s (web), stop after 5 minutes.
- Markdown rendering via `AttributedString(markdown:)` inline-only, matching existing notes rendering.
