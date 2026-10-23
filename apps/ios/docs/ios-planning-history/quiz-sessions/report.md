# Quiz sessions report

## What the learner can now do
From a topic's hub screen, open "Quick test": generate a multiple-choice quiz (single and multi-select), answer one question at a time with green/red feedback and per-option explanations, see score, start a new quiz after a confirm. Or open "Socratic dialogue": answer a mentor's prompts, see feedback and progress, hit checkpoints, finish and read a summary, start again after a confirm. Blocked courses (not confirmed, no calibration) show a message pointing to web.

## Files
- Sources/PostAnkiIOS/API/QuizSessionModels.swift, API/APIClient+QuizSessions.swift
- TopicQuizModel.swift, TopicQuizScreen.swift, SocraticModel.swift, SocraticScreen.swift, TopicStudyModesSection.swift
- Edited: TopicStudyScreen.swift (one line, `TopicStudyModesSection(topic: topic)`).

## Build
xcodegen + xcodebuild exit code 0, no errors or warnings in output.

## Defaults
- Question numbering uses the position in the question list, not the server `order`.
- Checkpoint "Finish" and toolbar "Finish" both call complete; "Start again" is shown after finishing or when all concepts are covered.
- Extra Socratic fields the plan did not need are not decoded.

## Not done
- Not run against a live server; top-level `null` decoding of the active-quiz call is untested manually.

END-OF-REPORT
