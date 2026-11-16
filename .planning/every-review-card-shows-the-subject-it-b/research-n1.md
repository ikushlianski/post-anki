# Research: Which surfaces does 'every review card' cover: iOS and Mac (apparently done), web, the Expo mobile app, the offline pack, and the Telegram bot? The code suggests iOS and Mac already show it, so the remaining gap may be web, Expo or the offline pack. I did not verify web or the offline pack.

## Facts
- Fact: The review queue controller returns cards grouped by subject, each with a subjectPath label (null when the card has no subject). Any client of that queue endpoint can show the subject without an API change. (source: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:42)
- Fact: The API type GroupedReviewCardRow adds subjectPath: string | null, set from a subjectId-to-label map. (source: apps/api/src/knowledge-bit/knowledge-bit-review-subject-groups.ts:3)
- Fact: The iOS and Mac review card body renders model.currentSubjectPath above the question, with accessibility identifier 'review-card-subject'. iOS and Mac are covered. (source: apps/ios/Sources/Shared/DueReviewCardBody.swift:37)
- Fact: The web review shared schema (packages/shared/src/knowledge-bit-review.ts) mentions subject only as a subjectId scope (lines 23 and 61). It has no subjectPath field, so the web Anki review card has no subject label in its data type. (source: packages/shared/src/knowledge-bit-review.ts:61)
- Fact: The web Anki review screen uses the subject only as an id, for hinting (useSubjectHinting), the subject chat panel (resolveCardSubjectId) and the done-screen forecast. I found no subject label rendered on the web review card, so web is a gap. (source: apps/web/src/knowledge-bit/anki-review-screen.tsx:77)
- Fact: A grep for subjectPath across apps/web/src found no match. Only subjectName usages for dashboards, analytics and chat-queue turned up. (source: apps/web/src/motivation/subject-mastery-list.tsx:15)
- Fact: The Telegram bot quiz view has no mention of subject, and a grep for subjectPath or subjectId in apps/bot/src/quiz found no match. The bot quiz cards show no subject today. (source: apps/bot/src/quiz/quiz-view.ts)
- Fact: The offline pack (buildReviewPack) does not yet group by subject or attach subjectPath. That work is planned in a sibling chapter and is still unchecked. (source: .planning/TODO.md:1879)
- Fact: The Expo mobile Today screen shows a single probe-push question and no subject on the card. Only a 'Practice a subject →' link mentions subjects. (source: apps/mobile/app/index.tsx:61)
- Fact: Any Expo code for this ticket must follow rule r1 and read the versioned Expo docs first. (source: apps/mobile/AGENTS.md:3)

## Open questions
- Open question: Which surfaces does 'every review card' cover beyond iOS and Mac (done): web Anki review, offline pack, Expo mobile and the Telegram bot quiz? Web, offline pack, Expo and the bot all lack a subject label in code. Is the offline pack's card renderer a real separate surface? I did not read it.
