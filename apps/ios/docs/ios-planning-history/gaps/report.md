# Gaps report

## What the learner can now do
From a topic's hub, open "Gaps": see gaps grouped as Open, Later (with return date), Dismissed, and Covered or skipped; add a gap (with wanted toggle and optional concern); swipe to want/unwant or skip/reopen; long-press to triage (Important, Later 60 days, Dismiss, Revisit), with only meaningful actions offered. From Home, "Gaps coming back" lists deferred gaps that are due and lets the learner mark them Important, Later again or Dismiss.

## Files
- Sources/PostAnkiIOS/API/GapModels.swift, API/APIClient+Gaps.swift
- TopicGapsModel.swift, TopicGapsScreen.swift, GapRow.swift, AddGapSheet.swift, ResurfacingGapsModel.swift, ResurfacingGapsScreen.swift
- Edited: TopicStudyModesSection.swift and HomeStudyModesSection.swift (one row each).

## Build
xcodegen + xcodebuild exit code 0, no errors or warnings.

## Defaults
- The triage case is named `later` in Swift (raw value `defer`, a reserved word).
- Resurfacing rows do not open the topic; mark-resurfaced is not called.
- "Later" availability is based on triage state only (the server decides if it is a no-op and shows "No change.").

## Not done
- Not exercised against a live server.

END-OF-REPORT
