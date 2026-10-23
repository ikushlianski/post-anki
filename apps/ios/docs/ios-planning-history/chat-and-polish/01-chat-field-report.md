# 01 chat field fix

Changes (diff: `git diff --cached -- Sources/PostAnkiIOS/API/Models.swift Sources/PostAnkiIOS/API/APIClient.swift Sources/PostAnkiIOS/KnowledgeItemChatScreen.swift`)
- `ChatTranscriptEntry.content` renamed to `text` (Models.swift), so the JSON key matches `chatMessageSchema` `{role, text}`.
- KnowledgeItemChatScreen.swift call sites updated to `.text`.
- Roles changed from "learner"/"tutor" to "user"/"assistant" at creation and in the display checks; the server enum only accepts user|assistant, so the old values would still be rejected.
- Stale "proposed contract" comment above `chatWithKnowledgeBit` replaced; 404-graceful handling kept.

Build: xcodebuild command from the brief, exit code 0 (first run failed only in the other implementer's PendingReview* files; passed on retry).

Defaults
- Renamed the property rather than adding CodingKeys.
- Also fixed role values (needed for the server to accept the transcript).
END-OF-REPORT
