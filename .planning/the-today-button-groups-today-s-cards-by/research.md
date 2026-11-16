# Research

## Facts
- Fact: The ticket is an unchecked item in the backlog with no coding tasks yet under its chapter. (source: .planning/TODO.md:1147)
- Fact: The chapter 'the-today-button-groups-today-s-cards-by' has an empty 'Coding tasks' section and a priority of medium. (source: .planning/TODO.md:1872)
- Fact: The API already groups review queue cards by subject. groupReviewCardsBySubject keeps first-seen subject order and attaches a subjectPath label (null when there is no subject). (source: apps/api/src/knowledge-bit/knowledge-bit-review-subject-groups.ts:5)
- Fact: The review controller applies that grouping to the queue before it returns it, so each card carries subjectPath. (source: apps/api/src/knowledge-bit/knowledge-bit-review.controller.ts:42)
- Fact: The iOS client already has ReviewSubjectGroups. cardsLeft counts the current card plus the following cards in the same subject. announcement builds 'Next subject: <path> · N cards here, M cards left in total'. (source: apps/ios/Sources/Shared/due-review-subject-groups.swift:3)
- Fact: DueReviewModel.currentSubjectPath and groupAnnouncement exist. The announcement shows only when the subject differs from previousSubjectPath and the card is not revealed. The overall remaining count comes from remainingCounts, or from 1 plus the queue length if that is nil. (source: apps/ios/Sources/Shared/due-review-progress.swift:20)
- Fact: DueReviewCardBody renders the current subject path from model.currentSubjectPath. (source: apps/ios/Sources/Shared/DueReviewCardBody.swift:37)
- Fact: iOS smoke tests cover cardsLeft and announcement. (source: apps/ios/Tests/PostAnkiMacSmokeTests/review-subject-groups-smoke-tests.swift:26)
- Fact: The Mac review subjects screen has an 'All subjects' row with a Today count column, and tapping it sets reviewsAll. Subject rows route to DueReviewScope(subject:). (source: apps/ios/Sources/PostAnkiMac/MacReviewSubjectsView.swift:95)
- Fact: The Expo mobile app's index screen is titled 'Today'. It shows a single probe-push question with a curriculumName · topicTitle context line, and it has no subject grouping, current-subject display or next-subject announcement. The Practice screens are separate routes (/practice, /practice/[subjectId]). (source: apps/mobile/app/index.tsx:15)
- Fact: Rule r1 applies to any work in apps/mobile: read the Expo v57 docs at https://docs.expo.dev/versions/v57.0.0/ before writing code. (source: apps/mobile/AGENTS.md:1)
- Fact: The sibling chapter on a Shuffle option for today's review plans a shuffle_review admin setting and a shuffleCards helper in knowledge-bit-review-queue-mix.ts. This is adjacent and could interact with subject grouping order. (source: .planning/TODO.md:1858)
- Fact: No wiki pages exist under .planning (glob wiki/**/*.md returned nothing), so the wiki gives no guidance on this ticket. (source: .planning/TODO.md)

## Open questions
- Open question: Which surface is 'the Today button'? No control named Today was found. Candidates: the 'All subjects' row with its Today column in the Mac review subjects view, an iOS equivalent in review-subjects-screen.swift, or the Expo 'Today' screen. I did not read review-subjects-screen.swift or the web app.
- Open question: Grouping, the current-subject label and the next-subject announcement already exist in the API and the iOS DueReviewModel. Should the work cover only the missing surface (Mac, web or Expo), or re-verify and change the existing iOS behaviour? I did not check whether the Today/all-subjects scope reaches this grouped path.
- Open question: Does 'how many cards remain' mean cards left in the next subject's group, cards left overall, or both? The iOS announcement currently gives both.
- Open question: The grouping order is the order subjects first appear in the queue. Should it stay that way, or be ordered some other way (for example alphabetical or by due count), and how should it interact with the planned Shuffle option?
