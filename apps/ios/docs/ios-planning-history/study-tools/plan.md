# Study tools: Ask, topic chat, notes, open questions

## Goal
Covers the four coding tasks in `.planning/study-tools/todo.md`:
1. An Ask screen that answers questions from all of the learner's cards.
2. A study chat on each topic.
3. Writing a note on a topic, and searching all notes.
4. A list of open questions, each markable as answered or dismissed.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-408`, 401). Errors are `{ "error": "<code>" }`; validation is 400 `invalid_input` (only `error` is decoded, existing `APIErrorBody`). Dates are ISO strings from `toISOString()`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /global-card-chat` | `apps/api/src/router-table.ts:363`, `apps/api/src/api-server.ts:692`, `apps/api/src/global-card-chat/global-card-chat.controller.ts:6-20` | `{ message: 1-20000 chars, transcript?: [{ role: "user"|"assistant", text }], allowGeneralKnowledge?: bool }` (`packages/shared/src/global-card-chat.ts:4-8`, `packages/shared/src/study-chat.ts:5-10`) | `{ reply: string, matchedCards: [{ variantId, prompt, topicTitle }], lookupFailed: bool }` (`global-card-chat.ts:12-24`) | 400 |
| `POST /topics/:id/study-chat` | `router-table.ts:355-360`, `api-server.ts:688`, `apps/api/src/study-chat/study-chat.controller.ts:10-33` | `{ message, transcript? }` (topicId comes from the path, `study-chat.controller.ts:15-18`) | `{ reply: string }` (`study-chat.ts:22-24`) | 400, 404 `not_found` (topic missing or not in a course, `apps/api/src/study-chat/study-chat.service.ts:26-37`) |
| `POST /notes` | `router-table.ts:679`, `api-server.ts:828`, `apps/api/src/note/note.controller.ts:31-49` | `{ nodeType: "topic"|"gap"|"source", nodeId, body: non-empty, isHighlight?: bool (default false), concern?: enum|null }` (`packages/shared/src/note.ts:22-28`) | **201** with a `Note` | 400, 404 `not_found` (node missing) |
| `GET /notes?nodeType=&nodeId=` | `router-table.ts:682`, `api-server.ts:830-834`, `note.controller.ts:51-66` | both query params required | `[Note]`, newest first (`apps/api/src/note/note.repo.ts:60`) | 400 `invalid_query` |
| `GET /notes/search?q=` | `router-table.ts:680`, `api-server.ts:836-842`, `note.controller.ts:68-101` | `q`; optional `concern`, `domainNodeId` (unused here) | `[Note]` ranked by full-text match (`apps/api/src/note/note-search.repo.ts:26`); blank `q` returns `[]` | 400 `invalid_concern` |
| `GET /open-questions?status=&limit=` | `router-table.ts:349`, `api-server.ts:680-685`, `apps/api/src/open-questions/open-questions.controller.ts:68-92` | `status?: "open"|"answered"|"dismissed"`, `limit?: positive int` (`packages/shared/src/open-questions.ts:39-42`) | `{ items: [OpenQuestion], totalCount: int }` (`open-questions.ts:46-49`), oldest first, default cap 1000 (`apps/api/src/open-questions/open-questions.repo.ts:54-66`) | 400 `invalid_input` |
| `PATCH /open-questions/:id` | `router-table.ts:350-354`, `api-server.ts:686`, `open-questions.controller.ts:94-117` | `{ status: "answered"|"dismissed", answerText?: string (max 2000) }` (`open-questions.ts:32-35`) | the updated `OpenQuestion` | 400, 404 `not_found` (missing or already resolved, `open-questions.repo.ts:83-93`) |

Shapes:
- `Note` (`note.ts:8-18`): `{ id, nodeType, nodeId, body, isHighlight: bool, concern: string|null, lastSurfacedAt: string|null, createdAt, updatedAt }`. Quirk: search results carry only `nodeType`/`nodeId`, no topic title, so a result row cannot name its topic.
- `OpenQuestion` (`open-questions.ts:11-22`): `{ id, sourceType: "probe_question"|"socratic_turn", sourceItemId, topicId: string|null, topicTitle: string|null, questionText, status, answerText: string|null, createdAt, resolvedAt: string|null }`. `answerText` is kept only for `answered` (`open-questions.repo.ts:95-103`).
- Chat quirk: both chats return 200 with a fallback sentence when the model call fails (`apps/api/src/study-chat/study-chat.service.ts:17,97`, `apps/api/src/global-card-chat/global-card-chat.service.ts:13,88`); `lookupFailed: true` means the card search failed and the answer did not use cards.
- Open questions are only created by web probe and socratic sessions (`apps/api/src/router-table.ts:337-348`), so the iOS list can be empty for a while; there is no create action here.

## Dropped
Nothing. Not built (not in the todo): note `concern` tagging, highlight-only filters, `GET /notes/review`, capturing open questions.

## Files
New (under `Sources/PostAnkiIOS/`):
- `API/StudyToolsModels.swift` (~110 lines): models below, `StudyToolsError` mapper.
- `API/APIClient+StudyTools.swift` (~70 lines): `askAllCards(message:transcript:allowGeneralKnowledge:)`, `askTopicChat(topicId:message:transcript:)`, `createTopicNote(topicId:body:isHighlight:)`, `topicNotes(topicId:)`, `searchNotes(query:)`, `openQuestions(status:)`, `resolveOpenQuestion(id:status:answerText:)`. Query strings built with `URLComponents`; path ids percent-encoded like `APIClient+ScheduledReview.swift`.
- `ChatViews.swift` (~90 lines): `ChatMessageRow(entry:, assistantLabel:)` and `ChatComposerBar(draft:, placeholder:, isSending:, onSend:)`, extracted from `KnowledgeItemChatScreen.swift`.
- `StudyChatModel.swift` (~90 lines): one chat model for both chats.
- `AskScreen.swift` (~120 lines): all-cards chat.
- `TopicStudyScreen.swift` (~150 lines): topic hub with chat link and notes.
- `TopicChatScreen.swift` (~60 lines): topic chat built on `StudyChatModel`.
- `NoteComposerSheet.swift` (~70 lines): write a note.
- `NotesSearchScreen.swift` (~120 lines): search all notes.
- `OpenQuestionsScreen.swift` (~180 lines): model, list, resolve sheet.
- `HomeStudyToolsSection.swift` (~40 lines): Home links.

Changed: `KnowledgeItemChatScreen.swift` (owned only here), `HomeScreen.swift` and `CoursesScreen.swift` (shared, minimal edits below).

## Swift models (`API/StudyToolsModels.swift`)
`Decodable, Sendable, Hashable` unless noted; inputs `Encodable, Sendable`. Chat turns reuse the existing `ChatTranscriptEntry { role, text }` from `API/Models.swift` (same JSON as the server's chat message).
- `AskAllCardsInput { message: String; transcript: [ChatTranscriptEntry]?; allowGeneralKnowledge: Bool }`, `MatchedCard { variantId, prompt, topicTitle: String }` (`id` = `variantId`), `AskAllCardsResult { reply: String; matchedCards: [MatchedCard]; lookupFailed: Bool }`.
- `TopicChatInput { message: String; transcript: [ChatTranscriptEntry]? }`, `TopicChatResult { reply: String }`.
- `Note { id, nodeType, nodeId, body: String; isHighlight: Bool; concern: String?; lastSurfacedAt: String?; createdAt, updatedAt: String }`, `CreateNoteInput { nodeType: String; nodeId: String; body: String; isHighlight: Bool }`.
- `OpenQuestion { id, sourceType, sourceItemId: String; topicId, topicTitle: String?; questionText: String; status: String; answerText: String?; createdAt: String; resolvedAt: String? }`, `OpenQuestionsPage { items: [OpenQuestion]; totalCount: Int }`, `ResolveOpenQuestionInput { status: String; answerText: String? }` (omits a nil or blank `answerText`).
- `enum OpenQuestionResolution: String { answered, dismissed }`.
- `StudyChatTurn { entry: ChatTranscriptEntry; matchedCards: [MatchedCard]; lookupFailed: Bool }` (local display type, not decoded).
- `enum StudyToolsError` with `message(for:)`: offline, unauthorized ("Check Settings"), 404 per screen ("This topic is no longer in a course", "Already resolved elsewhere"), generic.

## Screens and behaviour

### Shared chat pieces (`ChatViews.swift`, `StudyChatModel.swift`)
- `ChatMessageRow` and `ChatComposerBar` are lifted out of `KnowledgeItemChatScreen` unchanged in look; that screen then uses them (no behaviour change, its model untouched).
- `@MainActor @Observable final class StudyChatModel`: `turns: [StudyChatTurn]`, `draft`, `isSending`, `errorMessage`. Init takes a `send: @Sendable (String, [ChatTranscriptEntry]) async throws -> (reply: String, matched: [MatchedCard], lookupFailed: Bool)` closure. `send()` mirrors `KnowledgeItemChatModel.send()`: trim, append the user turn, send the prior transcript (nil when empty), append the reply; on error restore the draft, drop the user turn, set the message. The full transcript is sent each turn, as web and the existing item chat do.

### Ask screen (`AskScreen`)
- Entry: Home "Study tools" section, "Ask your cards".
- Header text "Answers come from your saved cards." and a toggle "Also use general knowledge" (default off, passed per send; mirrors web `apps/web/src/global-card-chat/global-card-chat-panel.tsx:33,134-141`).
- Each assistant turn lists its `matchedCards` under the reply as "From: <prompt> (<topicTitle>)", collapsed after 3. `lookupFailed` shows a caption "Couldn't search your cards; this answer is general."
- Empty state before the first message: `ContentUnavailableView("Ask anything", systemImage: "text.bubble", description: "Questions are answered from all your cards.")`. A toolbar "Clear" resets the conversation (local only).

### Topic hub and chat (`TopicStudyScreen`, `TopicChatScreen`, `NoteComposerSheet`)
- Entry: `TopicRow` in the course screen gets a third trailing icon button (`text.bubble`) pushing `TopicStudyScreen(topic:)`.
- `TopicStudyScreen`: title = topic title. Section "Study": "Practice" link to `ExerciseScreen(topics: [topic])`, "Chat about this topic" link to `TopicChatScreen(topic:)`. Section "Notes": newest first, body, "Highlight" star when `isHighlight`, relative `createdAt` via the existing `DueReviewModel.nextDueText(_:)`. Toolbar "+" opens `NoteComposerSheet`.
- Notes states: loading row; empty "No notes yet. Tap + to add one."; failure red caption with retry; pull to refresh reloads notes.
- `NoteComposerSheet`: multiline body, "Highlight" toggle, Save disabled while blank or saving. Save posts `nodeType: "topic"`, inserts the returned note at the top, closes. Failure keeps the text and shows the message; 404 says the topic was removed.
- `TopicChatScreen`: `StudyChatModel` bound to `askTopicChat(topicId:)`; assistant label "Tutor"; empty prompt "Ask about <topic title>". 404 shows "This topic is no longer in a course."

### Notes search (`NotesSearchScreen`)
- Entry: Home "Study tools", "Search notes".
- `.searchable`, debounced 300 ms; a new query cancels the previous request; blank shows a prompt "Search all your notes" instead of calling.
- Rows: body (3 lines), a kind label ("Topic note", "Gap note", "Source note"), relative date, highlight star. Rows are not tappable (results have no topic title or route).
- States: searching spinner in the list; no results `ContentUnavailableView.search(text:)`; failure caption.

### Open questions (`OpenQuestionsScreen`)
- Entry: Home "Study tools", "Open questions".
- Model loads `status=open`; a segmented picker switches to Answered or Dismissed (re-query). Header shows `totalCount`.
- Row: question text, topic title (or "No topic"), relative `createdAt`; resolved rows show `answerText` and `resolvedAt`.
- Open rows: swipe "Dismiss" (immediate PATCH `dismissed`) and tap to open a resolve sheet with an optional answer (max 2000, counter) and "Mark answered". Success removes the row from the open list and decrements the count. 404 removes the row and shows "Already resolved elsewhere".
- States: first-load spinner; failure `ContentUnavailableView` with "Try again"; empty open list "No open questions. Questions you flag during web study sessions appear here."; pull to refresh.

## Shared files
Re-read each file right before editing; targeted `Edit`, never a rewrite.
- `KnowledgeItemChatScreen.swift` (owned only here): replace the inline transcript row and composer `HStack` with `ChatMessageRow` / `ChatComposerBar`. Keep the "Send to inbox" context menu by passing it through a `contextMenu` modifier at the call site.
- `HomeScreen.swift` (shared with progress): one insertion only: `HomeStudyToolsSection()` as a new `Section` directly after the existing "Add knowledge" `Section`, before the `List` closes. Do not touch the top of the `List`, the models, `.refreshable`, or `.task` (progress edits those).
- `CoursesScreen.swift` (shared with progress): edits only inside `private struct TopicRow`: add the `text.bubble` `NavigationLink` to `TopicStudyScreen(topic: topic)` after the mic link. Nothing in `CoursesScreen` or `CurriculumDetailScreen` (progress edits that struct).
- Not touched: `HomeView.swift` (progress), any `PendingReview*` or `DueReview*` file (manage-knowledge).

## Edge cases
- Sending while a reply is pending: composer disabled by `isSending`.
- Message over 20,000 characters: the composer caps input at 20,000 so the server never returns 400 for length.
- Leaving a chat screen discards the conversation (no persistence; same as item chat).
- Topic outside any course (study chat 404) still allows notes, since notes only require the topic to exist.
- Double tap on "Dismiss": second call gets 404 and is treated as already resolved.

## Verification
No test target. `xcodegen generate`, then the usual simulator `xcodebuild` exits 0. Manual: Ask returns an answer citing cards also listed on web for the same question; general-knowledge toggle changes the answer style; topic chat replies; a note written on iOS appears on web for that topic and in iOS search; resolving an open question on iOS removes it from the web list; item chat still works after the view extraction.

## Defaults
- Home "Study tools" section as the entry for Ask, Notes search and Open questions; topic tools behind a new icon on each topic row, because there is no topic screen today and topic taps open practice directly.
- One `StudyChatModel` with an injected send closure serves both chats; item chat keeps its own model and only shares views.
- Full transcript sent each turn (matches web and item chat); no client cap beyond per-message length.
- Notes use `nodeType: "topic"` only; no concern tagging.
- Open questions default to the open filter; dismiss is one swipe, answering goes through a sheet.
