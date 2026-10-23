# Mac app crash and defect review

No try!, fatalError, as! or unguarded indexing in scope; no token logging.

1. High: Tags screen crash. Sources/Shared/TagsModel.swift:34 builds a Dictionary(uniqueKeysWithValues:) from server mastery rows; duplicate tagId traps. Use uniquingKeysWith.
2. Medium: Knowledge list context menu Delete/Move ignores the right-clicked ids and uses model.selection (MacKnowledgeView.swift:137-145).
3. Medium: Reject/Decline/Dismiss fire at once on whole selection with no confirmation or undo (MacInboxView act(on:), MacLearningListView.swift:83-148, MacOpenQuestionsView.swift:41-96). Pending review has an 8 s undo; be consistent.
4. Medium: Settings removeToken() does not post .postAnkiSettingsDidSave and has no confirmation (SettingsScreen.swift:66-78).
5. Medium: http:// non-localhost address is accepted, token withheld, banner says token rejected (SettingsScreen.swift:28-37, APIClient.swift:55-72). Reject or warn.
6. Medium: about 8 Mac list screens map failures to .other, hiding signed-out/offline states: MacSourcesView:64, MacSubjectsView:92, MacKnowledgeMapsView:75, MacTagsView:46, MacContentInboxView:27, MacInboxView:61, MacStudySessionsView:44, MacResurfacingGapsView:25. Keep ProgressLoadError in their models (DueReviewModel is the pattern).
7. Medium: Quick Practice Return key can send duplicate grading calls; submitAnswer() has no in-flight guard (IngestScreen.swift:32-51).
8. Medium: MacLaunchCheck maps every non-URLError, non-401 error to serverUnreachable (MacLaunchCheck.swift:25-38). Add a server-error issue.
9. Medium: Review inbox first load has no cancellation handling and sets hasLoaded on failure (KnowledgeItemInboxScreen.swift:23-46, MacInboxView).
10. Medium: PendingAnswerQueue drops queued answers on 429/408 (PendingAnswerQueue.swift:37-60); PendingGradeQueue.shouldKeep keeps them. Share the rule.
11. Low-medium: approving several unmatched inbox items opens an editor for one (MacInboxView act(on:), swipeApprove).

Below cutoff: PendingGradeQueue.load() returns [] on decode failure and next enqueue overwrites; OpenQuestionsModel and TopicGapsModel load() lack cancellation handling; nextQuestionVariants appends topicId unencoded.

END-OF-REPORT
