# Daily push: report

## What the learner can now do
- Home shows a Start your day card with today's topic, course and reason; tapping opens the day screen.
- Answer today's question, see pass/fail, feedback and covered gaps; open the topic; browse the due queue; pull to refresh.

## Files (Sources/PostAnkiIOS/)
- New: API/DailyPushModels.swift, API/APIClient+DailyPush.swift, DailyPushModel.swift, DailyPushScreen.swift, HomeDailySection.swift
- Edited: HomeScreen.swift (one line `HomeDailySection()`)

## Build
xcodegen generate then xcodebuild (simulator, unsigned): BUILD SUCCEEDED.

## Defaults taken
- Card on Home, no modal. Socratic mode only. Nothing queued offline.
- The card's reason is shown as text line rather than a chip view.

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
