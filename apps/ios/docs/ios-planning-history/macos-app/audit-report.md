# Swift API model audit against the server

Server compared (read-only): post-anki `packages/shared/src/*.ts` Zod schemas, `apps/api/src/*/*.controller.ts`, and `apps/api/src/router-table.ts` (215 routes).

## Decoding strategy
`APIClient` uses a plain `JSONDecoder`/`JSONEncoder`: no key or date strategy. Every date is a Swift `String` (ISO8601 from the server), and `StudySessionDates` parses them itself. No date-format decode risk exists.

## Endpoint paths and methods
Every Swift call matches a server route and method, including helper-built paths (curricula actions, learning-list-items, learning-paths, practice, tags, admin scans).

## Models checked (no decode mismatch)
Subject, Curriculum, Module, Topic, CurriculumDetail, NextQuestionVariant, GradeQuestionVariantAnswerResult, ReviewCard and ReviewCardsResponse, HomeSummary, Streak, Milestone, RetentionReport, WeeklyDigest, CurriculumStats, CourseBuild models, CourseEdit inputs, SubjectManage models, SubjectCategory, Admin (settings, observability, feedback by model, scan summaries), DailyPush, DueQueue, Decide, DomainMap, DomainSuggestions, CurriculumDomainMapping, CourseRefocus, SubjectDuplicate, SourceDuplicate, Gaps, GlobalSearch, KnowledgeManage, PendingReview and bulk approvals, ScheduledReview, StudySessions, Quiz sessions (probe, socratic), Practice, StudyTools (chat, notes, open questions), ChatTranscriptEntry (role and text), Tags, LearningList, LearningPath, Lectures, StudyMaterial, SourceLibrary, ContentInbox, Source regeneration, Notion import.

## Mismatches fixed
1. `TopicProbeAnswerInput` (StudySessionModels.swift): the server requires the `gapId` key (nullable). Synthesized encoding dropped the key when nil, so the server would answer 400. It now always writes `gapId` (null when nil). Tests in ServerContractTests.swift.
2. `SourceLibraryItem.kindLabel`: matched `research`, but the server kind is `web_research`. Display only, not a decode failure. Fixed, with a test.

## Ambiguous or left unchanged
- Server enums are Swift `String`s, so new values still decode.
- `AdminSettings.knowledgeItemModelId` is optional in Swift but non-null on the server; harmless.
- `PendingReviewBit` and `ReviewCard` ignore extra server fields (`isAiGenerated`, `sourceLinks`); harmless.
- `ChatWithKnowledgeBitInput` optional flags are defaulted by the server.
- Knowledge-bit PATCH sends `background` as explicit null, which the server allows.
- `courseBuildRetry` action names were not cross-checked with every caller; server routes for reparse, retry-research, retry-structure-draft, complete-pre-assessment exist.
- ContentInbox: server columns id, body, sourceRef, suggestedPlacement, createdAt are all non-null; Swift optionals for sourceRef and suggestedPlacement are looser, harmless.
- Mac smoke fixtures were not changed; they decode fine.

## Checks
- `swift test --package-path Packages/PostAnkiAPI`: 41 tests passed.
- Private copy at /private/tmp/audit-build, derived data /private/tmp/dd-audit: PostAnkiMac build succeeded, PostAnkiIOS (iOS Simulator) build succeeded, Mac smoke tests 16 passed.
- tsc, lint, vitest: not applicable (no package.json in this Swift repo).

END-OF-REPORT
