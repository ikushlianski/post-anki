# iPhone Triage swipe mode

## Goal
Triage runs one card at a time: swipe left rejects, swipe right approves, tap edits, optional subject filter before starting.

## Architecture
- Extend the existing focus-triage files in apps/ios/Sources/Shared (live iPhone Triage uses FocusTriageView via the inbox summary's Start triage). No parallel code.
- FocusTriageModel owns queue, filter, decisions, undo. FocusTriageSessionModel owns the session subject. FocusTriageView owns header and done state. FocusTriageCard only displays. New FocusTriageSwipeCard owns drag, threshold, fly-off.
- Unchanged: PendingReviewListModel, PostAnkiAPI package, Mac PendingReviewTriageView. New code compiles for macOS.

## Contracts
- FocusTriageQueue.build(sources:pinnedBitId:subjectId: String?) with nil meaning all; counts only cover the filter.
- FocusTriageSubject.options(sources) -> [(id: String?, name: String, readyCount: Int)], first entry All subjects.
- FocusTriageModel.subjectFilter: String?, kept through polling and reloads.
- FocusTriageStoredSession gains optional subjectId (old stored sessions still load); session starts with subjectFilter ?? FocusTriageSubject.single(sources).
- Card shows: front and back from PendingReviewTriageSelection.bestVariant; example from bit.background only when non-empty; source = subject name plus collapsed sourceText; optional note via existing notes binding. Body ("FACT") no longer shown.
- FocusTriageSwipe.decision(width:predictedWidth:) -> PendingReviewDecision? pure: left reject, right approve, below threshold nil.

## Decisions
- Approve still calls approveKnowledgeBit (keeps all variants) so undo and decision log stay unchanged.
- Swipe is not optimistic: card flies off, model awaits server, failure snaps back with message.
- Tap on the card body edits; no buttons on the card; VoiceOver gets Approve and Reject accessibility actions; Undo and Finish stay in the header.
- An open session fixes the picker to its subject until finished.
- Horizontal drag only when horizontal movement exceeds vertical, min distance about 20pt, keyboard dismissed on drag start.
- Keep model under 300 lines by putting filter helpers in focus-triage-rules.swift.
- Working tree has unrelated uncommitted edits (including focus-triage smoke tests); do not overwrite them.
