# Decide: challenge my thinking: report

## What the learner can now do
- Write a decision and where they lean, tap "Challenge my thinking", and get a verdict, strengths, questions to ask themselves and blind spots.
- Flag each pending blind spot as a gap to revisit or dismiss it; resolved ones show "Flagged" or "Dismissed" and offer no buttons.
- Start over with "New decision", and browse past decisions from the History button (blind spots there can still be resolved if pending).
- Entry: Home, "Learn more" section, row "Challenge my thinking".

## Files (Sources/PostAnkiIOS/)
- New: API/DecideModels.swift, API/APIClient+Decide.swift, DecideModel.swift, DecideScreen.swift, DecideSessionView.swift, DecideHistoryScreen.swift
- Edited: HomePracticeSection.swift (one row)

## Build
xcodegen generate then xcodebuild: exit 0.

## Defaults taken
- Form and latest result share one screen; history behind a toolbar button.
- Blind spots are final once resolved in the app (UI guard).
- Draft stays on failure; 502 shows "The reviewer is unavailable right now. Try again."
- A blind-spot 404 shows "That item is gone." without reloading history automatically (pull to refresh on history reloads).

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
