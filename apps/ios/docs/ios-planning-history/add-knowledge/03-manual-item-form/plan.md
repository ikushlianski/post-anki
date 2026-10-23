# 03 Manual item form

## Goal
A form (question, answer, optional example) that creates one pending-review knowledge item by hand, reachable from the type-or-dictate screen.

## Behaviour
- Form with Question (front), Answer (back), Example (optional); each shows a live "n/limit" counter that turns red past 300 / 600 / 300.
- Save is disabled while front or back is empty after trimming, any field is over its limit (trimmed length), or a save is in flight (blocks double submit).
- Success: alert "Saved for review", fields cleared. The item is pending, not approved (repo.ts:55); it appears in the pending review screen for approval.
- Failure: red inline message, fields kept so nothing is lost.

## Server contract (read-only, post-anki)
- Input (packages/shared/src/knowledge-bit.ts:142-152): `front` trim, min 1, max 300; `back` trim, min 1, max 600; `example` trim, max 300, nullable/optional, empty becomes absent. No `subjectId` or other fields. Limits at :138-140.
- Handler `handleCreateKnowledgeSourceItem` (apps/api/src/knowledge-source/knowledge-source-item.controller.ts:8-28): 400 `{error:"invalid_input", message}` (:16); repo errors map 404 `not_found`, 409 `already_running` / `entry_processed` (:6, :23); success `201` with the bare item (:27), no `{ok, item}` wrapper.
- Item JSON (knowledge-bit-manual-item.repo.ts:71-81): `{id, body, background, variants:[{id, kind:"basic", prompt, answer}], feedback:null, origin:"manual"}`; stored with `approvalState: "pending"` (:55).
- BLOCKER to verify before coding: no route is registered. `apps/api/src/router-table.ts` has nothing for this handler (it is untracked, uncommitted work). The shared comment (:137) says `POST /knowledge-sources/manual-items`, but the handler takes a source `id` and needs an existing, unprocessed, not-processing source (repo.ts:27-37). The web client (apps/web/src/curriculum/api-client.ts:588-597) calls `/knowledge-sources/${sourceId}/items` and expects `{ok, item}`, which disagrees with the controller. Also, a subject cannot be sent: the item inherits it from its source.

## Files
1. `Sources/PostAnkiIOS/API/KnowledgeModels.swift` (new): `CreateManualKnowledgeItemInput: Encodable` (`front`, `back`, `example: String?`, with example omitted when nil via custom `encode` or `encodeIfPresent`), and `CreateManualKnowledgeItemResult: Decodable` with all fields optional (`id: String?`, like `CreateKnowledgeSourceResult` in Models.swift:66) so either response shape decodes.
2. `Sources/PostAnkiIOS/API/APIClient+Knowledge.swift` (new): `extension APIClient { static func createManualKnowledgeItem(front:back:example:) async throws -> CreateManualKnowledgeItemResult }` calling `request(path, method: "POST", body:)`. Path in one `private static let` constant, default `/knowledge-sources/manual-items`.
3. `Sources/PostAnkiIOS/ManualKnowledgeItemScreen.swift` (new): `@Observable @MainActor final class ManualKnowledgeItemScreenModel` (same shape as `IngestionDictationScreenModel`) with `front`, `back`, `example`, `isSubmitting`, `errorMessage`, `showConfirmation`; computed `canSave`, trimmed-count helpers and limit constants (300/600/300); `save() async`. View is a `Form` with three sections (TextField axis vertical for question, TextEditor-style for answer, optional example), counter footer per section, Save button in its own section, error text, `.alert("Saved for review")`.
4. `Sources/PostAnkiIOS/IngestionDictationScreen.swift` (edit, minimal): add one `Section { NavigationLink("Write a question and answer instead") { ManualKnowledgeItemScreen() } }` inside the `Form`. Touch nothing else; another agent is editing this file (subjectId, init), so re-read it right before editing and keep the diff to that section.
5. Run `xcodegen generate` (new files must enter the project), then build.

## Steps
1. Re-check `router-table.ts` and `knowledge-source-item.controller.ts` in the post-anki repo; if the path differs from the default, change only the constant in step 2.
2. Create files 1, 2, 3 above.
3. Edit file 4.
4. `xcodegen generate`, then build the PostAnkiIOS scheme for an iOS 17 simulator with zero warnings in the new files.

## Error handling
- Map `APIError.badStatus(400, _)` to "Check the question and answer, then try again."; `404` / `409` to "This couldn't be added right now — try again later."; `unauthorized` to the existing sign-in wording used by other screens; anything else (including offline `URLError`) to "Couldn't save that — check your connection and try again."
- Offline is not queued: the message shows and the fields stay.
- `isSubmitting` is set before the await and reset after; `save()` returns early if already submitting.
- Trim front, back, example before sending; send `example: nil` when empty.

## Tests
None: the project has no test target and no dependencies may be added. Manual check: empty and whitespace-only fields keep Save disabled; 301-char question disables Save; airplane mode shows the error and keeps text; valid save shows the alert, clears fields, and the item shows up in pending review.

## Done when
- Form reachable from Add Knowledge (Courses topic path, and the Home path once the other agent's button lands).
- Counters and Save-disabled rules match the limits above.
- Success clears fields and confirms; failure keeps fields and shows a message; rapid double tap sends one request.
- `xcodegen generate` and build succeed; HomeView.swift and HomeScreen.swift untouched.

## Defaults taken
- Path `/knowledge-sources/manual-items`: it is the documented route in the shared schema comment and the brief; isolated in one constant because the server wiring is unconfirmed.
- Result struct with optional fields: the controller sends a bare item but the web client expects a wrapper; the app only needs success.
- No `subjectId` sent: the server input schema has no such field.
- Entry point is a NavigationLink inside the existing type-or-dictate screen: reachable from Home and Courses with no change to HomeView/HomeScreen.
- Offline failure shows a message, no queueing: PendingAnswerQueue is for answers and this todo is one item by hand.
- Confirmation uses an alert like `IngestionDictationScreen`: the existing success pattern.
- Counters count trimmed characters (Swift `count`): the server trims before measuring; Swift Characters can differ slightly from JS UTF-16 length for emoji, so near-limit emoji input may still get a 400, shown as the generic validation message.

END-OF-REPORT
