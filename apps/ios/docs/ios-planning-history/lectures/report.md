# Lectures report

## What the learner can now do
From a topic's hub, open "Lecture and examples": read the compiled lecture (sections, sources), compile one when missing or retry after failure, and recompile from a menu. If the course has no sources, find sources, approve or reject them, then compile. Request a worked example or an analogy and watch it appear when generated (polling every 2 seconds, up to 5 minutes).

## Files
- Sources/PostAnkiIOS/API/LectureModels.swift, API/APIClient+Lectures.swift
- LectureModel.swift, LectureScreen.swift, LectureSourcesSection.swift, StudyMaterialsModel.swift, StudyMaterialsSection.swift
- Edited: TopicStudyModesSection.swift (one row).

## Build
xcodegen + xcodebuild exit code 0, no errors or warnings.

## Defaults
- A 404 on the lecture means "none yet", not an error.
- Polling runs inside `load()`, so pull-to-refresh on a generating lecture keeps its spinner until generation ends or 5 minutes pass.
- The source list loads only when no lecture is ready, or after a no-sources error.

## Not done
- Not exercised against a live server.

END-OF-REPORT
