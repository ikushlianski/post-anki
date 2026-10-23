# Study sessions report

## What the learner can now do
From Home ("Study sessions and gaps" section), see the last-30-days consistency rate and sessions grouped as Upcoming, In progress, Missed and Done. Plan a session (anything or one course, 5-120 minutes, optional scheduled time) and start it right away. Run a session: a live timer, one question at a time (multiple-choice graded locally, or free text with a self-grade), feedback, then the next question; end it manually or when time is up; finished sessions show answered/correct counts, and sessions with no answers show as abandoned.

## Files
- Sources/PostAnkiIOS/API/StudySessionModels.swift, API/APIClient+StudySessions.swift
- StudySessionsModel.swift, StudySessionsScreen.swift, PlanStudySessionSheet.swift, StudySessionRunModel.swift, StudySessionRunScreen.swift, HomeStudyModesSection.swift
- Edited: HomeScreen.swift (one line, `HomeStudyModesSection()` after `HomeStudyToolsSection()`).

## Build
xcodegen + xcodebuild exit code 0, no errors or warnings.

## Defaults
- Dates stay ISO strings in models (matching existing code) and are parsed in `StudySessionDates`.
- The error "Try again" button reloads the session (or retries recording the answer if only that failed).
- Free-text answers need non-empty text before a self-grade button enables.
- Pushed gap is excluded after "Next" or "Skip".

## Not done
- Not exercised against a live server.

END-OF-REPORT
