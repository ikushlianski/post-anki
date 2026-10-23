# Language practice: report

## What the learner can now do
- Open "Language practice" from Home; subjects of kind language-practice are listed (a single one opens directly, none shows a "create one on the web" note).
- Pick level and topic pack (changing either saves and fetches a new batch, asking "Discard this batch?" if answers are unsent).
- Translate phrases in chunks of 5, submit, and see score, verdict, feedback, native alternatives and the reference English; "Mastered: <phrase>" banners appear; Continue moves to the next chunk, then Next batch.
- Open the phrase bank (Learning and Mastered) and check their free writing (5000-character counter) with past checks below.

## Files (Sources/PostAnkiIOS/)
- New: API/PracticeModels.swift, API/APIClient+Practice.swift, PracticeSubjectsScreen.swift, PracticeModel.swift, PracticeScreen.swift, PhraseCardView.swift, PhraseBankScreen.swift, WritingCheckModel.swift, WritingCheckScreen.swift
- Edited: HomePracticeSection.swift (one row)

## Build
xcodegen generate then xcodebuild: exit 0.

## Defaults taken
- Phrase bank and writing check are in a toolbar menu on the practice screen.
- Subject kind read by a feature-local decode (`PracticeSubject`), shared `Subject` untouched.
- Grading failure keeps typed answers; pull to refresh on the practice screen reloads settings only and keeps the batch.
- Phrase bank model lives in PhraseBankScreen.swift to keep file count down.

## Left undone
- Not run against the live API; build only.

END-OF-REPORT
