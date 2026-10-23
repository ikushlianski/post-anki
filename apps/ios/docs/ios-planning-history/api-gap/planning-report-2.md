# API gap planning report 2

Eight plans, written against the server code (read-only) and the current iOS app. Each plan has a verified API contract table, Swift models, screens, entry points, shared-file edits, edge cases, verification and defaults.

## Plans
Batch 1 (one implementer, in this order):
1. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/quiz-sessions/plan.md`: quick test and Socratic dialogue on a topic.
2. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/study-sessions/plan.md`: plan, run and end timed study sessions; consistency rate.
3. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/lectures/plan.md`: topic lecture (with source finding and approval), worked examples and analogies.
4. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/gaps/plan.md`: topic gaps (add, want, skip, triage) and gaps coming back.

Batch 2 (another implementer, in parallel, in this order):
1. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/learning-list/plan.md`: save links, act on recommendations, learning paths.
2. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/decide-sessions/plan.md`: "challenge my thinking" decisions and blind spots.
3. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/language-practice/plan.md`: phrase drills, phrase bank, writing checks.
4. `/Users/ikushlianski/webdata/ilya-projects/post-anki-ios/.planning/tags/plan.md`: tag list with mastery, tag detail, tag a topic, merge.

## Dropped, and why
- Socratic idle check: the bot's idle sweep, not a learner action.
- Exam mode and module, tag and curriculum quiz scopes; calibration quiz: not in the quiz todo (a blocked state points to web for calibration).
- Single-question topic probe start: superseded by quiz sessions on web; its answer call is used by study sessions.
- Per-question feedback and "save as open question": not in any todo.
- Learning-path and area targets when planning a study session: paths belong to batch 2 and areas have no iOS screen; existing ones still list.
- Topic flashcard generation: not in the lectures todo.
- Gap "mark resurfaced": the bot calls it after sending a reminder; calling it from the app would record a reminder that was never sent.
- Gap auto-defer sweep and the tagging scan: scheduler and operator jobs.
- Cross-cutting gap nudge: not in the gaps todo.
- Learning-list nudge responses: replies to bot reminders, not in the todo.
- Learning-path step practice: needs the topic answer flow owned by batch 1; deferred to a later ticket.
- Removing a tag from a topic: needs an assignment id the app has no way to get today.
- Tag quizzes: tag-scoped quiz sessions are outside the topic-only quiz plan.

## Shared-file edits
Every edit is one added line; the implementer re-reads the file first.
- quiz-sessions: `Sources/PostAnkiIOS/TopicStudyScreen.swift` gets `TopicStudyModesSection(topic: topic)` right after the "Study" section. Creates `TopicStudyModesSection.swift` (batch-1 owned).
- study-sessions: `Sources/PostAnkiIOS/HomeScreen.swift` gets `HomeStudyModesSection()` on the line after `HomeStudyToolsSection()`. Creates `HomeStudyModesSection.swift` (batch-1 owned).
- lectures: one row in `TopicStudyModesSection.swift`. No existing files.
- gaps: one row each in `TopicStudyModesSection.swift` and `HomeStudyModesSection.swift`. No existing files.
- learning-list: `HomeScreen.swift` gets `HomePracticeSection()` on the line before `HomeStudyToolsSection()`. Creates `HomePracticeSection.swift` (batch-2 owned).
- decide-sessions: one row in `HomePracticeSection.swift`. No existing files.
- language-practice: one row in `HomePracticeSection.swift`. No existing files.
- tags: one row in `HomePracticeSection.swift`; `TopicStudyScreen.swift` gets `TopicTagSection(topic: topic)` as the last item of its list, a different spot from batch 1's line.
- The two batches share no new files. Swift type names carry per-feature prefixes (`Quiz*`, `Socratic*`, `StudySession*`, `Lecture*`, `Gap*`, `LearningList*`, `LearningPath*`, `Decide*`, `Practice*`, `Phrase*`, `WritingCheck*`, `Tag*`), and each API extension declares its own private path helpers.

## Defaults taken
- No "More" list exists in `HomeView.swift` (it is a six-tab view and iOS builds the system More page itself), so the Home screen's feature sections act as the More list. `HomeView.swift` is not edited and no tab is added.
- Topic features enter from the topic hub; features not tied to a topic enter from Home.
- Quizzes are practice mode, topic scope, multi-select allowed (web behaviour). Discarding an old quiz or Socratic session asks first.
- Study sessions use the "socratic" question mode and the server's 30-day consistency window; planning targets are Anything or a course; default length 20 minutes.
- Lectures and study materials poll every 2 seconds while generating and stop after 5 minutes.
- Gap triage is in a context menu, curation in swipe actions; the resurfacing list is view-and-triage only.
- Learning-list errors map server codes to app-written messages; no polling while an item is being sorted.
- Decide blind spots are final once resolved in the app.
- Language practice reads a subject's kind with its own small decode instead of changing the shared subject model; chunks of 5 phrases.
- Nothing new is queued offline; the existing offline queue stays limited to card grading.

## Facts and assumptions
- Fact: every kept route is in `apps/api/src/router-table.ts` and dispatched in `apps/api/src/api-server.ts` (line numbers in each plan).
- Assumption: handler end-line numbers in some tables are approximate (taken from where the next handler starts); start lines were checked.
- To verify during implementation: decoding a top-level JSON `null` from the active-quiz call into an optional, and that blank learner-facing copy matches web wording closely enough.
END-OF-REPORT
