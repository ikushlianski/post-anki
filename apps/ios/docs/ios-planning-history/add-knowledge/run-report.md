# Run report: add-knowledge

## Item status
1. Add knowledge button on Home: DONE. Sources/PostAnkiIOS/HomeScreen.swift:86 opens the type-or-dictate screen with no course; shown whether or not a course was opened.
2. Send the course's subject with dictated text: DONE. Sources/PostAnkiIOS/CoursesScreen.swift:132 passes curriculum.subjectId; APIClient.createKnowledgeSource gains optional subjectId (omitted from JSON when nil, i.e. from Home).
3. Hand-written question-and-answer form: STALLED. The server handler (post-anki apps/api/src/knowledge-source/knowledge-source-item.controller.ts) is untracked and not in apps/api/src/router-table.ts, so any call would 404. Its real shape is POST /knowledge-sources/{id}/items against an existing unprocessed source, while the shared schema comment says /knowledge-sources/manual-items and the web client expects a {ok, item} wrapper but the handler returns the bare item. Plan kept at 03-manual-item-form/plan.md for when the route lands.
4. Link to review after sending: DONE. Sources/PostAnkiIOS/IngestionDictationScreen.swift:75 shows "Review new items" after a successful send; opens PendingReviewScreen() in a sheet.

## Defaults taken
- Subject only (no curriculum/topic id): the server input has only subjectId.
- From Home, no subject is sent; no course picker added.
- Submit disabled while sending (double-submit guard).
- Review screen presented as a sheet, not a NavigationLink as briefed: PendingReviewScreen wraps its own NavigationStack, and pushing it would nest stacks.
- The "Sent for review" alert is replaced by an inline section that waits for extraction before enabling the review link.
- Item 3 stalled rather than built against an unrouted, contradictory endpoint.

## Files touched
- Sources/PostAnkiIOS/IngestionDictationScreen.swift (optional topic/subject, double-submit guard, review link and sheet)
- Sources/PostAnkiIOS/HomeScreen.swift (Add knowledge section only)
- Sources/PostAnkiIOS/CoursesScreen.swift (TopicRow passes subjectId)
- Sources/PostAnkiIOS/API/APIClient.swift (createKnowledgeSource signature only)
- Sources/PostAnkiIOS/API/Models.swift (subjectId on CreateKnowledgeSourceInput)
- No new Swift files. These five are staged; HomeScreen.swift staging also includes the scheduled-review orchestrator's due-count lines in the same file. Nothing committed.

## Final build
xcodegen generate + xcodebuild (generic iOS Simulator, derived data /private/tmp/claude-501/dd-add-knowledge): exit 0.

## Not verified
- No live API: request bodies (subjectId present/absent) and server responses not exercised.
- No device or simulator run: layout, sheet behaviour and navigation are untested by eye.
- Open Low notes are in todo.md "To review / clarify".

## Manual test sequence
1. Home: tap "Add knowledge" (with and without a course opened before). Screen opens with no Topic caption.
2. Type text, Submit. Section shows "Sent. Extracting items...", then "Review new items" enables. Server record has no subject.
3. Tap "Review new items": Review sheet opens with the new pending items; swipe down returns to the form.
4. Courses > a course > a topic's mic icon: Topic caption shown. Submit text; the new source carries that course's subject and its items land in that course.
5. Turn network off, Submit: red error shows, typed text kept, no review link.
6. Tap Submit rapidly: only one source is created.

END-OF-REPORT
