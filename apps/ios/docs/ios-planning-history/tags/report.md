# Tags: report

## What the learner can now do
- Open "Tags" from Home: all tags with a mastery chip (New, Practicing, Struggling, Mastered), searchable, pull to refresh.
- Open a tag to see the topics, modules and knowledge bits it covers; tapping a topic opens its study hub.
- Merge a duplicate: swipe a tag, "Merge into...", pick the tag to keep, confirm; a "Moved n tags" note appears.
- On a topic's hub, a "Tags" section with "Add tag": search existing tags or "Create '<text>'"; tags added in the visit show as a list.

## Files (Sources/PostAnkiIOS/)
- New: API/TagModels.swift, API/APIClient+Tags.swift, TagsModel.swift, TagsScreen.swift (list and detail), MergeTagSheet.swift, TopicTagSection.swift
- Edited: HomePracticeSection.swift (one row), TopicStudyScreen.swift (one line `TopicTagSection(topic: topic)` after the Notes section)

## Build
xcodegen generate then xcodebuild: exit 0.

## Defaults taken
- Removing a tag from a topic is not built (the plan drops it: the app has no assignment id). The todo item text mentions "remove", so it is ticked with this gap noted here.
- Tag chips are a comma-joined text line rather than chip views; only tags added this visit show.
- Tag detail model and screen share TagsScreen.swift / TagsModel.swift to limit file count.
- Topic rows open the hub by loading the curriculum detail on tap.

## Left undone
- Tag removal (needs assignment ids), tag quizzes.
- Not run against the live API; build only.

END-OF-REPORT
