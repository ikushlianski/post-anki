---
type: spec
branch: learn-from-doc-site
task: iOS basic post-anki — triage, add knowledge, inbox, review
complexity: complex
state: confirmed
updated: 2026-10-24
---
# Spec: iOS basic post-anki

### Summary
The iPhone app gets the web app's one-card-at-a-time triage: every question variation shown, the fact underneath, an optional note, Approve or Reject saved on each tap, Undo of any earlier decision, and a Finish step with optional feedback. Add knowledge gains a subject choice, link support, clear refusal messages and a direct jump into triage, the Knowledge Inbox becomes a visible tab with a summary, and review shows the New/Learning/Due counts left today. Everything else the iOS app already does stays as it is, and the Mac app is unchanged.

### The ask
> build the iOS version of "basic post anki": (1) knowledge triage (approve/reject pending knowledge bits one at a time, undo), (2) adding knowledge, and triaging what was added, (3) a knowledge inbox, (4) reviewing cards (spaced-repetition review). The iOS app already exists and the Mac app already has some of this (commit 0ed7cf9 "Triage pending knowledge one piece at a time in the native apps", 59eb17c undo). FIRST audit what the iOS target already has versus these four capabilities, using the web app as the behaviour reference (apps/web/src/knowledge-bit, card-triage, add-knowledge flow, review) and the API routes in apps/api. The plan must cover only the GAPS, reuse Sources/Shared screens where the Mac app already has them, and follow the existing architecture. Recent web behaviour to mirror where relevant: focus-mode triage one card at a time with all question variations shown, fact shown below card fields, optional per-card note, Finish with optional feedback; decisions are written to the server on each Approve/Reject tap. Write the plan so the todo.md is split into independent aspects (Goal, Criteria, Coding tasks, Notes with Owns paths and Depends on) that cheaper Sonnet implementers can build in parallel without file overlap. Do not touch apps/api or apps/web (another agent is editing apps/api). No dependency additions (ask-first rule); no pushing; no secrets (never read Local.xcconfig or .env files). Do not implement anything.

### Audit — what iOS already has (Facts, all paths repo-root)
| Capability | Already on iOS | Gap vs web |
|---|---|---|
| Triage one at a time | Shared triage cover `apps/ios/Sources/Shared/pending-review-triage-view.swift`, model `apps/ios/Sources/Shared/pending-review-triage-model.swift`, opened full-screen on iOS from `apps/ios/Sources/Shared/PendingReviewScreen.swift:93`. It is the keep-up-to-two-variants model (`apps/ios/Sources/Shared/pending-review-triage-selection.swift:4`), calls `/knowledge-bits/:id/triage`, shows at most 9 variants, fact above cards, no note, no Finish, no session. | Web focus mode (`apps/web/src/knowledge-bit/knowledge-bit-focus-card.tsx`) is Approve-all-variants / Reject, variations first, example, then Fact, optional note, Finish with feedback via `/triage-sessions` (`apps/web/src/card-triage/use-triage-session.ts`). |
| Undo | Reject undo for 8 s via banner (`apps/ios/Sources/Shared/PendingReviewListModel.swift:66`), undo of the last keep (`apps/ios/Sources/Shared/pending-review-list-model+triage.swift:47`). No approve undo. | Web undoes any session decision, approve or reject, via `POST /knowledge-bits/:id/restore` (`apps/web/src/knowledge-bit/use-review-decisions.ts:113`; server restores any decided bit, `apps/api/src/knowledge-bit/knowledge-bit-feedback.repo.ts:189`). |
| Add knowledge | `apps/ios/Sources/Shared/IngestionDictationScreen.swift`: text only, subject only when opened from a course, generic error text, "Review new items" opens the pending sheet. | Web `apps/web/src/knowledge-source/add-knowledge-form.tsx`: subject picker, URL blocks, refusal sentences (`packages/shared/src/knowledge-source-refusal.ts:5`), "Add anyway" (`force`). |
| Knowledge inbox | Tab `KnowledgeInboxScreen` with badge (`apps/ios/Sources/PostAnkiIOS/HomeView.swift:23`), pending list, per-source Approve all, reject reason sheet, edit, regenerate, placements (`apps/ios/Sources/Shared/KnowledgeInboxMode.swift`). It is the 6th tab, so on iPhone it sits behind More (Assumption: standard iOS tab bar behaviour with more than five tabs). No summary, no polling for cards still being written. | Web landing (`apps/web/src/knowledge-bit/knowledge-bit-review-landing.tsx`) shows ready/waiting counts and Start triage; web polls every 8 s, max 40 tries (`apps/web/src/knowledge-bit/knowledge-bit-review-polling.ts:4`). |
| Review | Full review on iOS: `apps/ios/Sources/PostAnkiIOS/DueReviewScreen.swift` + shared `DueReviewModel*` (grades with interval previews, undo, edit, offline grade queue, empty/next-due states). | Web shows remaining New/Learning/Due counts with a legend (`apps/web/src/knowledge-bit/anki-review-counts.tsx`), lowered per graded card (`apps/web/src/knowledge-bit/anki-review-session.ts:80`). Server counts are decoded on iOS but never shown (`apps/ios/Sources/Shared/DueReviewModel+Loading.swift:41`). |

API endpoints the gaps need — all exist server-side (Fact, `apps/api/src/router-table.ts`): `POST /knowledge-bits/:id/approve`, `/reject`, `/restore` (:208), `POST /knowledge-bits/:id/grades` `{rating, note}` (:214), `PATCH /knowledge-bit-feedback/:id` partial `{note}` (:220, controller uses `updateKnowledgeBitFeedbackInput`), `POST /triage-sessions` `{subjectId?}` (:802), `POST /triage-sessions/:id/finish` `{feedbackText, decisions[{bitId, verdict}]}` (:811; schemas `packages/shared/src/card-triage-session.ts`), `POST /knowledge-sources` `{text|url, subjectId?, force?}`. Missing in the Swift client: grades, partial feedback note, triage sessions, url/force on create, `subjectId` on pending sources.

### Derivers
| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `FocusTriageQueue.build` | pending sources, pinned bit id | current ready bit + its source, readyCount, waitingCount (bits with no variants) | SCENARIO 1, SCENARIO 5, SCENARIO 7 |
| `FocusTriageDecisionLog` (value type) | ordered decisions, undo, baseline | last-decided bit for undo, session decisions list capped at 500, accepted/rejected counts | SCENARIO 2, SCENARIO 4 |
| `FocusTriageNote.trimmed` / `FocusTriageFeedback.trimmed` | raw text | trimmed text capped at 500 / 8,000, nil when empty | SCENARIO 3, SCENARIO 4 |
| `FocusTriageSubject.single` | pending sources | the one subject id shared by all sources with bits, else nil | SCENARIO 4 |
| `FocusTriagePollPlan` | waiting count, attempts so far | poll again yes/no (8 s interval, stop at 40 attempts or 0 waiting) | SCENARIO 5 |
| `AddKnowledgeInput.classify` | raw text | `.url(URL)` when the whole trimmed input is one http(s) link, else `.text` | SCENARIO 6 |
| `KnowledgeSourceRefusal.from(error)` | API error | refusal case with the web's sentence, or nil | SCENARIO 6 |
| `ReviewRemainingCounts` | server counts, graded phases this load | remaining New/Learning/Due (new phase lowers New, other phases lower Due, floor 0) | SCENARIO 8 |

### Files by scenario
| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 | None | `apps/ios/Sources/Shared/focus-triage-model.swift`, `focus-triage-queue.swift`, `focus-triage-card.swift`, `focus-triage-view.swift`, `PendingReviewScreen.swift` | None |
| SCENARIO 2 | None | `apps/ios/Sources/Shared/focus-triage-model.swift`, `focus-triage-decision-log.swift`, `focus-triage-view.swift` | None |
| SCENARIO 3 | None | `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/triage-session-client.swift`, `apps/ios/Sources/Shared/focus-triage-model.swift`, `focus-triage-card.swift` | None |
| SCENARIO 4 | None | `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/triage-session-client.swift`, `triage-session-models.swift`, `apps/ios/Sources/Shared/focus-triage-session-model.swift`, `focus-triage-session-store.swift`, `focus-triage-done.swift`, `focus-triage-result.swift` | None |
| SCENARIO 5 | None | `apps/ios/Sources/Shared/focus-triage-model.swift`, `focus-triage-queue.swift` | None |
| SCENARIO 6 | None | `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/knowledge-source-add-client.swift`, `knowledge-source-refusal.swift`, `apps/ios/Sources/Shared/IngestionDictationScreen.swift`, `add-knowledge-input.swift`, `add-knowledge-subject-picker.swift`, `PendingReviewScreen.swift` | None |
| SCENARIO 7 | None | `apps/ios/Sources/PostAnkiIOS/HomeView.swift`, `HomeScreen.swift`, `apps/ios/Sources/Shared/pending-review-inbox-summary.swift`, `PendingReviewScreen.swift`, `pending-review-layout.swift` | None |
| SCENARIO 8 | None | `apps/ios/Sources/Shared/review-remaining-counts.swift`, `DueReviewModel*.swift`, `apps/ios/Sources/PostAnkiIOS/DueReviewScreen.swift`, `review-counts-strip.swift` | None |
| SCENARIO 9 | None | every shared file above, built in both schemes | None |

### Files to create
```
apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/
  triage-session-client.swift        — startTriageSession, finishTriageSession, gradeKnowledgeBit(note), updateKnowledgeBitFeedbackNote
  triage-session-models.swift        — TriageSessionResponse, TriageDecision, CardStyleNote, inputs
  knowledge-source-add-client.swift  — addKnowledgeSource(text|url, subjectId, force)
  knowledge-source-refusal.swift     — KnowledgeSourceRefusal enum + web sentences + from(error)
apps/ios/Packages/PostAnkiAPI/Tests/PostAnkiAPITests/
  triage-session-contract-tests.swift      — request paths/bodies + response decoding
  knowledge-source-add-contract-tests.swift — url/force bodies + refusal mapping
  Fixtures/triage-session.json             — open session response
  Fixtures/triage-session-finished.json    — finished response with two style notes
apps/ios/Sources/Shared/
  focus-triage-queue.swift           — deriver: current/ready/waiting, pinned current
  focus-triage-decision-log.swift    — deriver: decision stack, session decisions, counts
  focus-triage-rules.swift           — derivers: note/feedback trimming, single subject, poll plan
  focus-triage-model.swift           — @Observable: approve/reject/undo/note/poll over PendingReviewListModel
  focus-triage-session-model.swift   — @Observable: start/resume/finish/discard session
  focus-triage-session-store.swift   — UserDefaults store keyed by ServerScope
  focus-triage-card.swift            — one card: variations, example, fact, source, note, Reject/Approve
  focus-triage-done.swift            — all decided / writing more + Finish + feedback
  focus-triage-result.swift          — accepted/rejected + style notes, stale Discard
  focus-triage-view.swift            — shell: progress, waiting, Undo, Finish; hosts card/done/result
  pending-review-inbox-summary.swift — "N cards waiting", "Writing cards… x of y", Start triage
  add-knowledge-input.swift          — deriver: text vs single link
  add-knowledge-subject-picker.swift — subject menu (No subject + listSubjects)
  review-remaining-counts.swift      — deriver: remaining New/Learning/Due
  review-counts-strip.swift          — counts row + legend
apps/ios/Tests/PostAnkiMacSmokeTests/
  focus-triage-smoke-tests.swift          — queue, decisions, undo, notes, polling against FakeServer
  focus-triage-session-smoke-tests.swift  — start, resume, finish, stale, store scoping
  add-knowledge-smoke-tests.swift         — classify, refusal messages, force retry
  review-remaining-counts-smoke-tests.swift — count lowering, undo, reload reset
```

### Files to modify
```
apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/PendingReviewModels.swift
  — add optional subjectId to PendingReviewSource (defaulted init param, withBits keeps it). Decoding of existing payloads must not change.
  used by: APIClient+PendingReview.swift, Sources/Shared/pending-review-triage-model.swift, PendingReviewListModel.swift, PendingReviewRows.swift, PendingReviewScreen.swift
  tests: Packages/PostAnkiAPI/Tests/PostAnkiAPITests/PendingReviewDecodingTests.swift
apps/ios/Sources/Shared/PendingReviewScreen.swift
  — iOS branch only: summary + Start triage above the list, full-screen cover hosts the focus view instead of the keep/drop view; when opened with onDone (from Add knowledge) the focus view opens at once. Mac branch untouched.
  used by: Sources/PostAnkiMac/Library/MacKnowledgeInboxView.swift, Sources/Shared/IngestionDictationScreen.swift, Sources/Shared/KnowledgeInboxMode.swift
  tests: none
apps/ios/Sources/Shared/pending-review-layout.swift
  — default layout .list on iOS, .triage on macOS.
  used by: PendingReviewScreen.swift
  tests: none
apps/ios/Sources/Shared/IngestionDictationScreen.swift
  — subject picker when no subject passed, link vs text, refusal sentences, Add anyway, success copy. Must keep topic/subject init used by courses and the Mac feature.
  used by: Sources/PostAnkiIOS/HomeScreen.swift, Sources/PostAnkiMac/Features/MacCoreFeatures.swift, Sources/Shared/CurriculumDetailScreen.swift
  tests: none
apps/ios/Sources/Shared/DueReviewModel.swift, DueReviewModel+Loading.swift, DueReviewModel+Grading.swift, DueReviewModel+Undo.swift
  — store server counts and graded phases; reset on load; add on grade (online and offline); remove on undo. No change to grading, queue or undo behaviour.
  used by: Sources/PostAnkiIOS/DueReviewScreen.swift, Sources/PostAnkiMac/MacDueReviewView.swift
  tests: Tests/PostAnkiMacSmokeTests/ScheduledReviewQueueSmokeTests.swift, ServerBoundQueueSmokeTests.swift
apps/ios/Sources/PostAnkiIOS/DueReviewScreen.swift
  — show the counts strip above the card and on the empty state.
  used by: HomeView.swift, DueTodayCard.swift
  tests: none
apps/ios/Sources/PostAnkiIOS/HomeView.swift
  — five tabs: Home, Review, Inbox (badge), Add, Courses.
  used by: PostAnkiIOSApp.swift
  tests: none
apps/ios/Sources/PostAnkiIOS/HomeScreen.swift
  — links to Progress and the answer-practice screen (former tabs).
  used by: HomeView.swift
  tests: none
apps/ios/README.md, apps/ios/docs/ARCHITECTURE.md
  — iOS tabs, screens and triage description (current state).
```

### Risk & rollout
- Shared screens compile into the Mac app: a change in `PendingReviewScreen`, `IngestionDictationScreen` or `DueReviewModel` can regress the Mac build or its inbox/review; both schemes must build and Mac tests pass (SCENARIO 9).
- The Mac app keeps the keep/drop triage; the two triage models now coexist in Shared until the Mac adopts focus mode.
- Approve now keeps all variations on iOS (web behaviour) instead of the native keep-up-to-two choice; this is a deliberate behaviour change for iPhone users.
- No server change, no migration, no new dependency; rollback is a revert of the iOS commits.

### Seed data
| Scenario | Realistic data needed | Source |
|---|---|---|
| SCENARIO 1–5, 7 | 2–3 pasted sources in two subjects with 6–10 pending cards, one still writing its questions | existing local flow: Add knowledge against the dev API (`npm run dev`), plus smoke-test FakeServer replies |
| SCENARIO 8 | a dozen approved cards, some new and some due | existing dev database after approving; smoke tests use `review-cards.json` |

### Documentation changes
- `apps/ios/README.md`: replace "Planned screens"/"Scaffolding only" with the iOS tabs and what each does.
- `apps/ios/docs/ARCHITECTURE.md` "iOS shell": tabs, focus triage on iOS vs keep/drop triage on Mac, session store keyed by server.

### Decisions made autonomously
- iOS triage switches to the web's Approve/Reject focus mode; the keep-up-to-two view stays for the Mac only — ask says mirror web; leaving Mac alone limits blast radius.
- Focus triage logic lives in `Sources/Shared` (compiles on both, tested by Mac smoke tests) but is wired only on iOS — follows "reuse Shared", gives tests.
- Approve and Reject call the existing approve/reject endpoints; Undo calls restore for both — matches web and the server's restore of any decided bit.
- No reason sheet in focus mode; the optional note replaces it (web behaviour). The list keeps its reason sheet.
- Note on Approve is sent as a grade with neutral rating 3 plus the note; note on Reject patches the reject feedback — copies web.
- Triage session starts when focus opens; subject sent only when all pending sources share one subject. If start fails, triage still works and Finish just closes with a notice.
- Open session id and decisions are stored in UserDefaults keyed by server address, so another server never resumes it — follows the offline-queue scoping convention.
- The current card is pinned while shown; polling only adds cards behind it.
- Polling: every 8 s while any card waits, max 40 tries, only while the focus view is on screen — web's numbers.
- No swipe gestures in focus mode; buttons only, to avoid accidental server writes.
- Hardware-keyboard shortcuts on iPad are not added.
- Add knowledge: one input; a lone http(s) link is sent as a link. Multi-block paste is not added.
- "Add anyway" re-sends with force; the link to the earlier source is not shown (the client error type carries no details).
- iPhone tab bar: Home, Review, Inbox, Add, Courses. Progress and the "Ingest" answer-practice screen move to links on Home.
- Review counts strip lives in the iOS review screen only; counts maths in Shared.
- Swift files added in kebab-case, matching recent native files.

### Implementation order
1. API client additions + contract tests (aspect A1)
2. Focus triage derivers, then models and session store, with smoke tests (A2)
3. Review counts deriver + model wiring + strip (A5) — parallel with 1–2
4. Add knowledge derivers + screen (A4) — after 1
5. Focus triage views + inbox summary + iOS wiring (A3) — after 2
6. iOS tab bar + Home links (A6) — parallel any time
7. Docs (A7) — last
Builds after each aspect: `xcodegen generate`, both schemes, `swift test --package-path apps/ios/Packages/PostAnkiAPI`, Mac Cmd-U suite.

### Scope boundary
- Mac app adopting focus triage — cut; Mac keeps its keep/drop triage.
- Style notes list/editing screen — cut; result only lists notes returned by Finish.
- Bury/suspend during review, session celebration/points, chat from a card — cut.
- Multi-block paste, model choice, link to the earlier duplicate source — cut.
- Global "Approve all" across sources and source regeneration changes — cut (per-source exists).
- iPad keyboard shortcuts and swipe gestures in focus mode — cut.
- Renaming or reworking the "Ingest" answer-practice screen — cut (only moved off the tab bar).
- Any change under apps/api or apps/web — out of scope.
