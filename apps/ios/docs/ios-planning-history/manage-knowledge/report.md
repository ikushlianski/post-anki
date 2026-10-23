# Manage knowledge: report

## What the learner gets
- Review tab has an "All items" button. It opens a list of every approved item with search (300 ms debounce), a subject filter and a status filter (All, New, Learning, Review). Status filters only the pages already loaded, and the list says "Filtering loaded items" while more pages exist. "Suspended" opens the separate Suspended list. Paging loads as you scroll; pull to refresh.
- Tapping an item shows its question, answer, status, subject, due and lapses, with Suspend / Unsuspend / "Bring back today". The detail screen is read-only for text.
- Edit button selects rows. Bottom bar has Move (pick a subject in a sheet) and Delete (confirmation dialog). Skipped items are explained (gone, not approved, placed in a course). Max 200 selected. Delete removes rows locally; move reloads page one.
- Suspended list: reason chip (Suspended, Leech, Buried until...), "since", "Bring back" button or swipe.
- Edit: pending items in the Review tab have an Edit button (wording, background, each question). Changing the wording disables question edits and warns that questions regenerate. The Due today card has a pencil that edits the shown card; the card keeps its reveal state and swaps to the new variant id.
- Rejecting a pending item opens a reason sheet (eight reasons, optional note up to 500 characters, Send or Skip) when the server returns a feedback id. Undoing the reject clears it.

## Files
New in Sources/PostAnkiIOS: API/KnowledgeManageModels.swift, API/APIClient+KnowledgeManage.swift, KnowledgeListModel.swift, KnowledgeListModel+Bulk.swift, KnowledgeListScreen.swift, KnowledgeItemDetailScreen.swift, SuspendedKnowledgeScreen.swift (model and view), QuestionVariantEditSheet.swift, PendingReviewEditSheet.swift, PendingReviewListModel+Feedback.swift (feedback and edit save), RejectReasonSheet.swift, DueReviewModel+Edit.swift.
Changed: API/APIClient+PendingReview.swift (reject returns feedback id), PendingReviewListModel.swift, PendingReviewListModel+BulkUndo.swift, PendingReviewScreen.swift, PendingReviewRows.swift, DueReviewModel.swift (current no longer private(set)), DueReviewScreen.swift (283 lines).

## Build
xcodegen generate, then xcodebuild: exit code 0, no errors or warnings.

## Defaults
- Course filter means subject. Status filter is in memory. Text editing is offered in the Review tab and Due card only, because the list has no variant ids (see plan).
- Unsuspending in the detail screen shows "Active" until the next refresh, since the server does not return the underlying state.
- Reason sheet is optional (Skip sends nothing).
- Variant edits in the Review tab are saved one by one; a failure midway keeps the sheet open, and a later retry may report "changed elsewhere" because ids were replaced.

## Not done
- No automated tests (no test target) and no manual run on a simulator against the live API.
END-OF-REPORT
