# Report: items 1-2 (transcribed by orchestrator; implementer's Write was refused)

Build: exit 0 (xcodegen generate + xcodebuild, own derived data). Staged the five source files; nothing committed; HomeView.swift untouched. App not run.

- Models.swift: `CreateKnowledgeSourceInput` gains `let subjectId: String?` (nil omitted from JSON).
- APIClient.swift: `createKnowledgeSource(text:subjectId: String? = nil)`; KnowledgeItemChatScreen callers unchanged.
- IngestionDictationScreen.swift: optional topic and subjectId; caption only with a topic; submit sends subjectId; double-submit guard plus Submit disabled while sending.
- CoursesScreen.swift: `TopicRow` takes `subjectId` from `curriculum.subjectId` and passes it to the mic link.
- HomeScreen.swift: new "Add knowledge" section (square.and.pencil) opening `IngestionDictationScreen()`, after the error block, visible with or without a course.

Deviations: none.

END-OF-REPORT
