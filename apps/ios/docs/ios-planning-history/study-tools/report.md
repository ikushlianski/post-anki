# Study tools report

## Built (learner behaviour)
- Ask your cards (Home > Study tools): chat answered from all saved cards; each answer lists the cards it used (first 3, expandable); optional "Also use general knowledge" toggle; warning when card search failed; Clear resets the conversation.
- Topic hub: a new chat-bubble icon on every topic row opens a screen with Practice, "Chat about this topic" and the topic's notes (newest first, highlight star, relative date, pull to refresh, retry on failure). "+" opens a note composer (text, Highlight toggle).
- Search notes (Home > Study tools): debounced 300 ms search, newer query cancels the old one, rows show kind, date, highlight; blank query shows a prompt.
- Open questions (Home > Study tools): Open/Answered/Dismissed picker with count; swipe to dismiss; tap an open row to mark answered with an optional answer (2000 cap with counter). A 404 removes the row and says "Already resolved elsewhere".
- Messages are capped at 20,000 characters in the composer. Full transcript is sent each turn; conversations are not persisted.

## Files (Sources/PostAnkiIOS/)
New: API/StudyToolsModels.swift, API/APIClient+StudyTools.swift, ChatViews.swift, StudyChatModel.swift, AskScreen.swift, TopicStudyScreen.swift, TopicChatScreen.swift, NoteComposerSheet.swift, NotesSearchScreen.swift, OpenQuestionsScreen.swift, HomeStudyToolsSection.swift.
Edited: KnowledgeItemChatScreen.swift (uses shared ChatMessageRow/ChatComposerBar), HomeScreen.swift (one HomeStudyToolsSection line), CoursesScreen.swift (one link inside TopicRow).

## Build
xcodegen generate; xcodebuild simulator build exit code 0, no errors or warnings in log.

## Defaults
- StudyChatModel send handler is @MainActor so the Ask toggle is read live without locks.
- Note rows in search are not tappable (results carry no topic title).
- Notes are topic-only; no concern tagging.
- Staged HomeScreen.swift and CoursesScreen.swift are shared with the progress feature, so their staged content may include that feature's edits.

## Left undone
Nothing. No test target exists, so manual checks from the plan remain unrun.

END-OF-REPORT
