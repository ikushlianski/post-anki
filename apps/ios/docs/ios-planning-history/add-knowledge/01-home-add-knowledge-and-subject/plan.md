# Plan: Home "Add knowledge" button + send course subject with dictated text

## Goal
Home gets an "Add knowledge" entry that opens the type-or-dictate screen with no course picked; when the screen is opened from a course, the course's subject id is sent so new items land in that course's subject.

## Facts (investigated)
- Server "subject" is a top-level grouping; a curriculum (course) belongs to exactly one subject via `subjectId` (`/Users/ikushlianski/webdata/ilya-projects/post-anki/packages/shared/src/curriculum.ts:38`). Knowledge sources attach to a subject, not a curriculum or topic.
- iOS `Curriculum` already has `subjectId: String` (`Sources/PostAnkiIOS/API/Models.swift:11`). No model change needed. `Topic` has no subject, so the subject must come from the curriculum.
- `CurriculumDetailScreen` holds `curriculum` (`Sources/PostAnkiIOS/CoursesScreen.swift:85`) but the private `TopicRow` (line 119) only gets a `Topic`; it must also receive the subject id.
- `CreateKnowledgeSourceInput` is synthesized `Codable` (`Models.swift:62`); a nil `String?` is omitted by synthesized encoding (`encodeIfPresent`), so no custom encoder.

## API contract (server, read-only)
- `POST /knowledge-sources` routed at `apps/api/src/router-table.ts:17`.
- Body schema `singleTextInput = { text: string max 50000, subjectId?: string|null (min 1), modelId?: ... }` at `apps/api/src/knowledge-source/knowledge-source.controller.ts:20-26`.
- Text is trimmed; empty text returns 400 `invalid_input` (controller :184-189).
- Missing/null `subjectId` means "no subject" (:191); a non-null unknown id returns 400 `subject_not_found` (:193-196, helper :37-39). Success is 201 with the source (:198-199).
- Empty-string `subjectId` is rejected (`min(1)`), so the client must never send "".

## Approach
- `APIClient.createKnowledgeSource(text:subjectId:)` gains a defaulted `subjectId: String? = nil`, so the two callers in `KnowledgeItemChatScreen.swift` (lines 61, 76) compile unchanged and keep sending no subject.
- `CreateKnowledgeSourceInput` gets `let subjectId: String?`. When opened from Home it is nil and absent from the JSON.
- `IngestionDictationScreen(topic: Topic? = nil, subjectId: String? = nil)`. Topic caption hidden when topic is nil. Model passes `subjectId` to the API.
- Home adds a `NavigationLink` to `IngestionDictationScreen()`.

## Steps
1. `Sources/PostAnkiIOS/API/Models.swift`: in `CreateKnowledgeSourceInput` add `let subjectId: String?` (minimal, one line; no other edits).
2. `Sources/PostAnkiIOS/API/APIClient.swift`: change only `createKnowledgeSource` (line 92) to `createKnowledgeSource(text: String, subjectId: String? = nil)` and build `CreateKnowledgeSourceInput(text: text, subjectId: subjectId)`.
3. `Sources/PostAnkiIOS/IngestionDictationScreen.swift`:
   - Model: `let topic: Topic?`, `let subjectId: String?`; `init(topic: Topic?, subjectId: String?)`.
   - `submit()` calls `createKnowledgeSource(text: trimmed, subjectId: subjectId)`.
   - View: `init(topic: Topic? = nil, subjectId: String? = nil)`; wrap the caption `Section` in `if let topic = model.topic { ... }`.
4. `Sources/PostAnkiIOS/CoursesScreen.swift`:
   - `TopicRow` gets `let subjectId: String`.
   - In `CurriculumDetailScreen` pass `TopicRow(topic: topic, subjectId: curriculum.subjectId)` (line ~99).
   - The mic link becomes `IngestionDictationScreen(topic: topic, subjectId: subjectId)` (line 131).
5. `Sources/PostAnkiIOS/HomeScreen.swift` (surgical insert only; another agent is adding a due-count card in the same `List`). Insert one new `Section { NavigationLink { IngestionDictationScreen() } label: { Label("Add knowledge", systemImage: "square.and.pencil") } }` as a sibling placed immediately after the `if let errorMessage = model.errorMessage { ... }` block (just before the `List`'s closing brace, line ~78), outside the `if/else if` on `curriculumName`, so it shows with or without a course. Do not touch `HomeView.swift`, the model, toolbar or any other line. Re-read the file right before editing and anchor on the current text, since line numbers may have shifted.

## Tests
None: the project has no test target and the brief says no tests. Verify by building: `xcodegen generate` then `xcodebuild` for an iOS 17 simulator. Both must pass with no Swift 6 concurrency warnings.

## Edge cases
- Empty or whitespace text: `submit()` guard returns early (existing) and the Submit button is disabled (existing); server would also 400.
- Offline or any error: existing catch shows "Couldn't send that - try again." and keeps the typed text (text is cleared only on success).
- Nil subject (from Home): field omitted, server stores with no subject.
- Stale/deleted subject: server returns 400 `subject_not_found`; surfaces as the generic retry message (acceptable, rare).
- Double submit: not guarded today (`isSubmitting` is set but the button is not disabled by it). Add `|| model.isSubmitting` to the Submit button's `.disabled` and `guard !isSubmitting` in `submit()` to prevent duplicate sources. This stays inside `IngestionDictationScreen.swift`.
- Text over 50,000 chars: server 400; generic error. Not handled client-side.

## Done when
- Home shows "Add knowledge" whether or not a course was ever opened, and it opens the screen with no Topic caption.
- Dictating from a topic's mic icon sends `{"text":..., "subjectId":<curriculum.subjectId>}`; from Home sends `{"text":...}` with no `subjectId` key.
- `KnowledgeItemChatScreen` still compiles and behaves as before.
- Project builds clean; only the five allowed files changed; `HomeView.swift` untouched.

## Defaults taken
- Subject only, not curriculum/topic: the server API has no field for them.
- Omit `subjectId` for Home rather than sending null: synthesized encoding omits nil and the server treats both the same.
- Optional-with-default params keep `KnowledgeItemChatScreen` and other callers untouched.
- No picker for choosing a subject on the Home path: the todo says "without picking a course".
- Reuse the existing generic error message for `subject_not_found`.
- Submit disabled while sending, to stop double submits, as a small safe fix in a file already being edited.
- Button icon `square.and.pencil` and its own List section, per the brief.

END-OF-REPORT
