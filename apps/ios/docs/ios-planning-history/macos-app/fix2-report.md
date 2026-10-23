# Mac review fixes, batch 2

Findings 2, 3, 6, 9, 11 plus the below-cutoff cancellation handling.

## Fixes

- 2 Knowledge context menu: Move and Delete now set the selection to the right-clicked ids before opening the sheet or dialog, so the action hits what was clicked. The menu is hidden on empty space or while a bulk action runs. (Sources/PostAnkiMac/MacKnowledgeView.swift)
- 3 Confirmation: new Sources/PostAnkiMac/MacDestructiveConfirmation.swift (MacDestructiveRequest and .macConfirmDestructive) gives one confirmation dialog ("Reject 3 items?"). Used for Inbox Reject (toolbar and context menu), Learning list Decline, Open questions Dismiss (toolbar, context menu, Delete key). The 8 s undo was not reused: it relies on server restore endpoints that exist only for pending-review bits.
- 6 Failure kinds: added failureKind (ProgressLoadError, `from(error) ?? .other`, cleared at load start) to SourceLibraryModel, ContentInboxModel, SubjectManageModel, DomainMapModel, StudySessionsModel, ResurfacingGapsModel, KnowledgeItemInboxModel, and TagsModel. MacSourcesView, MacContentInboxView, MacSubjectsView, MacKnowledgeMapsView, MacTagsView, MacStudySessionsView, MacResurfacingGapsView and MacInboxView pass it to MacLoadStateView. iOS screens are untouched and compile.
  - TagsModel (sibling's file): I added only the failureKind property, its reset in load() and its assignment in load()'s generic catch. The dictionary code was not touched.
  - StudySessionsModel and ResurfacingGapsModel also gained a CancellationError branch so a cancelled load is not shown as a failure.
- 9 Review inbox first load: KnowledgeItemInboxModel now owns hasLoaded, set only on success. A cancelled load (CancellationError or URLError.cancelled) returns quietly with no error and no hasLoaded; a failure keeps the screen in the error state. isLoading resets through defer. MacInboxView uses model.hasLoaded.
- 11 Bulk approve: new KnowledgeItemInboxModel.approveSelected. One item keeps the old behavior (approve if confident, else open the editor). Several items approve only confident matches; unmatched ones stay in the list and a notice ("N items need a deck...") is shown in MacInboxView. No editor opens for an arbitrary item.
- Below cutoff: OpenQuestionsModel.load() and TopicGapsModel.load() now return on cancellation (`catch where ProgressLoadError.from(error) == nil`) without setting an error; isLoading is reset.

## Tests

Tests/PostAnkiMacSmokeTests/ReviewFixesSmokeTests.swift (9 tests) plus Fixtures/placement-suggestions.json: failure kinds (unauthorized on 7 models, offline on 2, cleared on success), inbox cancelled and failed first load, bulk approve with unmatched items, single unmatched opens the editor, cancelled loads for open questions and topic gaps. Confirmation dialogs and the context-menu selection are view-only and not unit tested.

## Checks

- Spec copy: /private/tmp/spec-fx2 (symlinked Sources, Tests, Packages, Config; xcodegen run there only), derived data /private/tmp/dd-fx2.
- PostAnkiMac build: succeeded. PostAnkiIOS build (iOS Simulator): succeeded. PostAnkiMac tests: 66 passed, including the new ones.
- Not run: lint, tsc, vitest (Swift repo, none configured).

## Defaults

- Confirmation is shown for every Reject/Decline/Dismiss, including single items.
- Bulk approve is sequential, not concurrent.
- Sibling's files (SettingsScreen, IngestScreen, queues, MacLaunchCheck, APIClient) were not touched; I did not stage MacLaunchCheck.

END-OF-REPORT
