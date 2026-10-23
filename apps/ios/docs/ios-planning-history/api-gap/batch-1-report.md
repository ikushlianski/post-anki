# API gap batch 1 report

All four folders built; every build ran `xcodegen generate` then the simulator `xcodebuild` and exited 0 with no errors or warnings. Each folder's todo item is ticked and has its own report.md. Not run against a live server (no test target).

## quiz-sessions
Learners can run a multiple-choice Quick test and a Socratic dialogue on a topic (generate, answer, feedback, new quiz or restart after confirm, summary, blocked-course messages). See `.planning/quiz-sessions/report.md`.

## study-sessions
Learners can plan, start, run (timer, questions), end and review timed study sessions from Home, and see the 30-day consistency rate. See `.planning/study-sessions/report.md`.

## lectures
Learners can read or compile a topic lecture, find and approve sources when the course has none, and request worked examples and analogies with 2-second polling. See `.planning/lectures/report.md`.

## gaps
Learners can see, add, curate and triage a topic's gaps, and see deferred gaps due to come back from Home. See `.planning/gaps/report.md`.

## Shared-file edits
- TopicStudyScreen.swift: one line (`TopicStudyModesSection(topic: topic)`).
- HomeScreen.swift: one line (`HomeStudyModesSection()`).
- TopicStudyModesSection.swift and HomeStudyModesSection.swift: created by batch 1; rows from quiz, lectures, gaps and study-sessions.

## Defaults and notes
- Every plan's defaults are listed in its own report.
- The last folder's staging used `git add Sources/PostAnkiIOS`, so batch 2's in-progress files under that folder may also be staged; no commits were made.
- Pull-to-refresh on a generating lecture waits for polling to finish.

END-OF-REPORT
