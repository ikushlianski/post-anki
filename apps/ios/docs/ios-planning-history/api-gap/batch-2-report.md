# Batch 2 report: learning list, decide, language practice, tags

All four folders build: `xcodegen generate` then `xcodebuild ... generic/platform=iOS Simulator` exits 0 with no warnings or errors shown. Todo items are ticked. Not run on a simulator against the live API.

## Learning list and paths (`.planning/learning-list/report.md`)
Save article/video links, see recommendations, approve or decline, choose a destination for parked items, sort captured items, open created courses; list, start and abandon learning paths. Creates the Home "Learn more" section.

## Decide sessions (`.planning/decide-sessions/report.md`)
Submit a decision and leaning, get verdict, strengths, questions and blind spots, flag or dismiss each blind spot, browse history.

## Language practice (`.planning/language-practice/report.md`)
Pick level and pack, translate phrases in chunks of 5 with grading, phrase bank, writing checks with history.

## Tags (`.planning/tags/report.md`)
Tag list with mastery, tag detail, merge, add or create a tag on a topic.

## Shared-file edits
- HomeScreen.swift: one line, `HomePracticeSection()` before `HomeStudyToolsSection()`.
- TopicStudyScreen.swift: one line, `TopicTagSection(topic: topic)` after the Notes section.
- HomePracticeSection.swift is batch-2 owned; it holds four rows.

## Defaults and gaps
- "Sort it now" uses a subject picker because items carry no subject.
- Tag removal is not built (plan dropped it; the todo text mentions "remove"), so that item is ticked with the gap stated.
- Early on, one `git add Sources` also staged batch 1's files in progress; nothing was committed.
- No polling, nothing queued offline, no token logged or stored.

END-OF-REPORT
