# Research

## Facts
- Fact: The ticket is an unchecked coding task in the TODO under a Review chapter: 'Every review card shows the subject it belongs to, so the learner knows the context before answering.' The chapter 'every-review-card-shows-the-subject-it-b' has an empty Coding tasks list and was created by goal run run-20261116t231930z. (source: .planning/TODO.md:1146)
- Fact: The API already attaches a subjectPath label to review queue cards. It is null when a card has no subject. (source: apps/api/src/knowledge-bit/knowledge-bit-review-subject-groups.ts:19)
- Fact: The iOS and Mac review card body already renders the current subject path above the question, with the accessibility identifier 'review-card-subject'. (source: apps/ios/Sources/Shared/DueReviewCardBody.swift:37)
- Fact: The iOS ReviewCard model decodes an optional subjectPath, and a test covers both the present and the missing case. (source: apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/ScheduledReviewModels.swift:51)
- Fact: Mac Review already has a TODO item marked done: 'Mac Review shows a progress counter and the subject above the question.' (source: .planning/TODO.md:284)
- Fact: The sibling chapter 'the-today-button-groups-today-s-cards-by' plans to group buildReviewPack (offline pack) cards by subject and attach subjectPath to each card. It is still unchecked. That work would give offline-pack cards a subjectPath. (source: .planning/TODO.md:1879)
- Fact: The Expo mobile 'Today' screen shows a single probe-push question. The only subject-related text I found in it is a 'Practice a subject →' link, so it shows no subject on the card. (source: apps/mobile/app/index.tsx:61)
- Fact: Any Expo code for this ticket must follow rule r1: read the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing mobile code. (source: apps/mobile/AGENTS.md:3)
- Fact: Earlier work already made review cards carry their subject for the web review chat panel ('Review cards carry their subject, so the chat panel works on the home page too'). This is done, but I did not check the field name or whether it is displayed on the card. (source: .planning/TODO.md:825)
- Fact: Web files with 'review' in the name that mention subjectPath or subjectName are under apps/web/src/knowledge-bit, for example knowledge-bit-review-focus-view.tsx and knowledge-bit-review-landing.tsx. I did not read them, so I don't know whether the web review card displays the subject. (source: apps/web/src/knowledge-bit/knowledge-bit-review-focus-view.tsx)

## Open questions
- Open question: Which surfaces does 'every review card' cover: iOS and Mac (apparently done), web, the Expo mobile app, the offline pack, and the Telegram bot? The code suggests iOS and Mac already show it, so the remaining gap may be web, Expo or the offline pack. I did not verify web or the offline pack.
- Open question: Should the label be the full path (for example 'Business › Sales') as on iOS, or only the leaf subject name? And what should show for a card with no subject (null)?
- Open question: Is the subject shown before the answer is revealed, and does it stay visible after the reveal? The ticket's goal text says the learner should know the context before answering. iOS shows it above the question.
