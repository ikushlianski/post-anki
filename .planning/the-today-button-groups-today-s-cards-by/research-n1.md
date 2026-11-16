# Research: Which surface is 'the Today button'? No control named Today was found. Candidates: the 'All subjects' row with its Today column in the Mac review subjects view, an iOS equivalent in review-subjects-screen.swift, or the Expo 'Today' screen. I did not read review-subjects-screen.swift or the web app.

## Facts
- Fact: The iOS review-subjects screen has an 'All subjects' row. Tapping it selects scope 'all'. Its start control is a main-action tile titled 'Start review', or 'Start review: <name>' when a subject is selected. Nothing on this screen is labelled 'Today'. (source: apps/ios/Sources/Shared/review-subjects-screen.swift:104)
- Fact: On the iOS review-subjects screen, starting with 'all' or no selection sets reviewsAll and opens session(nil, learnAhead.days). Starting with a subject routes to DueReviewScope(subject:). (source: apps/ios/Sources/Shared/review-subjects-screen.swift:114)
- Fact: The Mac subject row header has a literal 'Today' column title, which is a count column, not a button. (source: apps/ios/Sources/PostAnkiMac/MacReviewSubjectRowView.swift:11)
- Fact: The only 'Today' control that starts a review is the iOS DueTodayRow. It reads 'Due today', shows a total and a review/learning/new breakdown, and is a NavigationLink to DueReviewScreen. It appears on HomeScreen and on TodayScreen. (source: apps/ios/Sources/PostAnkiIOS/DueTodayCard.swift:4)
- Fact: TodayScreen (navigation title 'Today') contains the DueTodayRow section. It is reached from the More screen via the .today destination. (source: apps/ios/Sources/PostAnkiIOS/today-screen.swift:3)
- Fact: The Mac app has a 'Today' feature entry and MacHomeView is titled 'Today'. It holds a DueTodayModel. (source: apps/ios/Sources/PostAnkiMac/MacHomeView.swift:15)
- Fact: The web sidebar has no control named Today. Its only 'Today' match is the newRemainingToday count. The web app has Today count columns for subjects in subject-today-columns.tsx and knowledge-browser-subject-list.tsx. (source: apps/web/src/nav/sidebar.tsx:92)
- Fact: The Expo mobile app's index screen is titled 'Today'. It shows a single probe-push question with no subject grouping, so it is not a card-review surface. (source: apps/mobile/app/index.tsx:15)
- Fact: Subject grouping, the current-subject label and the next-subject announcement ('Next subject: <path> · N cards here, M cards left in total') already exist in the iOS shared review code, which is the path DueReviewScreen uses. The 'Today' surfaces that start a review (DueTodayRow, the All-subjects start) feed this path. (source: apps/ios/Sources/Shared/due-review-subject-groups.swift:3)
- Fact: Rule r1 applies only if the work touches apps/mobile (Expo): read the Expo v57 docs first. (source: apps/mobile/AGENTS.md)

## Open questions
- Open question: Most likely 'the Today button' is the iOS DueTodayRow ('Due today' → DueReviewScreen), possibly also the Mac Today home. No control is literally a 'Today button', so the target surface needs confirming.
- Open question: Grouping, the current-subject label and the announcement already exist in the API and the iOS DueReviewModel. Should the work only verify that DueTodayRow's path (DueReviewScreen with nil scope) shows them, or add them to a surface that lacks them (Mac, web, Expo)? I did not trace DueReviewScreen to the grouped model.
- Open question: Should 'how many cards remain' be the next subject's group count, the overall remaining count, or both? The existing iOS announcement gives both.
