# Course building: report

## What the learner can now do
- Courses tab, Organise section: "New course" and "Courses being built".
- Create a course from links, a research topic, a document link or pasted material (one mode per course), with subject and optional category.
- Follow the build: gathering sources, approve or remove sources and add links, chat to shape the structure (with research candidates to accept or skip), confirm structure, choose topics, confirm the course. Failed builds can be retried.

## Files (Sources/PostAnkiIOS/)
- New: API/CourseBuildModels.swift, API/APIClient+CourseBuild.swift, CourseBuildCreateModel.swift, CourseBuildCreateScreen.swift, CourseBuildModel.swift, CourseBuildModel+Actions.swift, CourseBuildScreen.swift, CourseBuildSourcesSection.swift, CourseBuildStructureSection.swift, CourseBuildTopicPickSection.swift, CourseBuildListScreen.swift
- Edited: CourseOrganizeSection.swift (two rows, created by subject-management)

## Build
xcodegen generate then xcodebuild (simulator): exit 0.

## Defaults taken
- Polling is a single task: 4 s while gathering, 3 s while an assistant turn is pending, stops after 10 minutes with "Still working. Pull to refresh."
- After "Confirm course" the screen shows an "Open course" link instead of pushing automatically.
- Source removal asks first; no per-source approve (no route).
- Retry: sources origin uses reparse, else retry-structure-draft if a draft attempt exists, else retry-research.
- "Skip these" sends an empty approved list for research candidates.
