# Research

## Facts
- Fact: The product is a personal learning system where notes and sources become cards that are triaged, reviewed and discussed. Clients are web, iPhone/Mac, Telegram, Chrome extension, desktop (Tauri) and mobile. (source: README.md)
- Fact: There is no `wiki/index.md` in the repo. The wayfinder wiki is absent, so the planning sources are `.planning/`, `.product/` and `docs/`. (source: README.md)
- Fact: The original vision is an architecture-mentor system, not a flashcard app. It tracks gaps discovered through Socratic conversation and sends a daily push question. The goal is architectural judgment, not recall. (source: .product/VISION.md)
- Fact: Early product docs rejected spaced-repetition scheduling, manual card creation, MCQ as the primary mode, and AI auto-created gaps. They also set no streaks, no gamification and no guilt nudges. (source: .product/BACKEND-COVERAGE.md)
- Fact: Backend coverage is reported as complete at a basic level: curriculum CRUD, parse, probe (socratic and quick_test), gaps, daily-push selection, /decide, cross-cutting rollup, re-parse and add-sources. The daily-push cron trigger and Telegram delivery were left as infrastructure work. (source: .product/BACKEND-COVERAGE.md)
- Fact: Study goals already exist: per-subject priorities, a daily review goal and add-knowledge goals, all computed on read. (source: docs/study-goals.md)
- Fact: Documented design areas already cover: study stats dashboard, phrase-bank mastery, check-my-writing mode, decide mode, workplace scenario packs, visual knowledge map, local-first Electric sync, Tauri desktop, mobile study loop, AI duplicate detection, doc-changelog scan and learning-map chat. Candidate features should be checked against these to avoid recommending what already exists. (source: README.md)
- Fact: The open backlog contains candidate features. Triage-style swipe accept/reject of chat-proposed cards, plus the same chat on iOS and Mac. Chat grounded by author context and web search with a smarter model tier. Web offline review race fixes. A Shuffle option for today's review. Voice chat polish. (source: .planning/TODO.md:109)
- Fact: Backlog items marked `[blocked: user]` include: Anki .apkg import/export (needs a dependency decision), an FSRS scheduler with a retention setting (needs ts-fsrs approval), a session token cap raise for planned Anki-parity items, a Notion source sync, and the AWS backend migration. (source: .planning/TODO.md:1021)
- Fact: The FSRS scheduler and Anki-parity items are planned in the current backlog. This conflicts with the older product docs that rejected spaced-repetition scheduling. (source: .planning/TODO.md:1253)
- Fact: Other backlog items that are not blocked on the user include: showing the subject on every review card, grouping Today's cards by subject (the last two commits are `feat(ios): announce next subject in Today review` and `feat(api): group review pack by subject`), a Business sub-subject seed, and the Chrome extension capture flow. (source: .planning/TODO.md:1173)

## Open questions
- Open question: Does the earlier rejection of spaced-repetition scheduling still stand? The current backlog plans FSRS and Anki parity. The answer decides whether scheduling and import/export features can be listed as candidates.
- Open question: Which user and use case should the features serve: the single owner learning architecture, or a broader English/business/IT learner? The product has grown beyond the original vision.
- Open question: What does 'rough size' mean here (S/M/L, or days or todos)? Assume S/M/L, with S about 1 todo, M about 3–5 and L a multi-chapter effort.
- Open question: Does 'new' exclude features already in the backlog and design docs, or may the list include backlog items that are not yet built? Assume it lists new ideas and marks overlap with existing backlog items.
