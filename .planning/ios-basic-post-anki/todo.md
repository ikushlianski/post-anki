---
type: todo
branch: learn-from-doc-site
task: iOS basic post-anki — triage, add knowledge, inbox, review
state: open
updated: 2026-10-24
---
# Todo: iOS basic post-anki

Contract: `spec.md` (Derivers, Decisions, Files). Each aspect below owns its files exclusively; never edit a file owned by another aspect. Waves: A1, A5, A6 start at once; A2 and A4 after A1; A3 after A2; A7 last. Every aspect ends with `xcodegen generate` in `apps/ios`, both schemes building (`PostAnkiIOS` for the iOS simulator, `PostAnkiMac`), `swift test --package-path apps/ios/Packages/PostAnkiAPI`, and the `PostAnkiMac` test suite passing. New Swift files use kebab-case names. No new dependencies, nothing under `apps/api` or `apps/web`, never read `Local.xcconfig` or `.env*`.

## Decisions to make
Nothing to decide.

## To review / clarify
Nothing to review.

## Aspect A1 — API client for triage sessions, notes and adding sources

**Goal:** the Swift package can start/finish triage sessions, attach notes to decisions, send a link or a forced text when adding knowledge, and knows each pending source's subject.

**Criteria:**
- Request paths, methods and JSON bodies match the endpoint list in `spec.md` "Audit" exactly; contract tests prove each.
- Finished-session fixture decodes accepted/rejected counts and style notes.
- Existing `pending-review.json` still decodes; `subjectId` decodes when present, nil when absent.
- Each refusal code maps to the web's sentence; unknown codes map to nil.

**Coding tasks:**
- [ ] Add triage session, decision, style note and input models
- [ ] Add start/finish session, grade-with-note, feedback-note calls
- [ ] Add addKnowledgeSource with text or url, subjectId, force
- [ ] Add KnowledgeSourceRefusal with web sentences and error mapping
- [ ] Add optional subjectId to PendingReviewSource, keep withBits
- [ ] Add two fixtures and contract tests for all new calls

**Notes:**
- Owns: `apps/ios/Packages/PostAnkiAPI/Sources/PostAnkiAPI/triage-session-client.swift`, `triage-session-models.swift`, `knowledge-source-add-client.swift`, `knowledge-source-refusal.swift`, `PendingReviewModels.swift`; `apps/ios/Packages/PostAnkiAPI/Tests/PostAnkiAPITests/triage-session-contract-tests.swift`, `knowledge-source-add-contract-tests.swift`, `Fixtures/triage-session.json`, `Fixtures/triage-session-finished.json`.
- Depends on: none.
- Follow `APIClient+PendingReview.swift` style (static funcs on `APIClient`, `encodedSegment`). Server schemas: `packages/shared/src/card-triage-session.ts`, `packages/shared/src/knowledge-bit-review-feedback.ts`, `packages/shared/src/knowledge-source-refusal.ts` (read only).

## Aspect A2 — Focus triage logic (shared models)

**Goal:** a tested, platform-neutral model that drives one-card-at-a-time Approve/Reject with per-tap server writes, undo of any session decision, notes, polling for waiting cards, and the triage session lifecycle.

**Criteria:**
- Approve/Reject call the existing endpoints, remove the card, adjust the inbox badge, and move to the next ready card.
- Failure keeps the card with the existing outcome messages; "decided elsewhere" removes it with a notice.
- Undo restores the last decided card (approve or reject) as current; 404/409 shows a message, offline allows retry.
- Note sent only after a successful decision; note failure shows "Couldn't save your note." and keeps the decision.
- Current card stays pinned across reloads; polling every 8 s, max 40, only while waiting > 0 and started.
- Session: starts with single subject or nil; resumes from store for the same server only; finish sends decisions (max 500) and feedback (max 8,000); 404/409 sets stale; discard clears the store.
- Smoke tests cover each criterion with business-language `should` names.

**Coding tasks:**
- [ ] Write deriver tests: queue, decision log, rules, poll plan
- [ ] Implement focus-triage-queue, decision-log and rules derivers
- [ ] Implement FocusTriageModel over PendingReviewListModel: decide, undo, notes
- [ ] Add bounded polling start/stop to FocusTriageModel
- [ ] Implement session store keyed by ServerScope in UserDefaults
- [ ] Implement FocusTriageSessionModel: start, resume, finish, stale, discard
- [ ] Smoke-test model and session against FakeServer inline replies

**Notes:**
- Owns: `apps/ios/Sources/Shared/focus-triage-queue.swift`, `focus-triage-decision-log.swift`, `focus-triage-rules.swift`, `focus-triage-model.swift`, `focus-triage-session-model.swift`, `focus-triage-session-store.swift`; `apps/ios/Tests/PostAnkiMacSmokeTests/focus-triage-smoke-tests.swift`, `focus-triage-session-smoke-tests.swift`.
- Depends on: A1.
- Do not edit `PendingReviewListModel*`; use its existing `snapshot(of:)`, `remove(bitId:)`, `insert(_:)`, `load()`, `counts`, `inFlight`. Use `PendingReviewDecision.outcome(for:)` for messages. Do not trigger the reject banner or reason sheet. Web reference: `apps/web/src/knowledge-bit/use-review-decisions.ts`, `apps/web/src/card-triage/use-triage-session.ts`. Use `FakeReply.json` inline; do not add fixtures (A1 owns them).

## Aspect A3 — Focus triage screens and inbox wiring (iOS)

**Goal:** iPhone users open the inbox to a summary with Start triage, then triage in a full-screen focus view that mirrors the web card layout, with Undo, Finish, feedback and result.

**Criteria:**
- Card order: subject label, all variations open (kind label, prompt, answer), example, Fact, AI label, "Where this came from" disclosure, Note (optional), sticky Reject/Approve with spinner on the pressed button.
- Approve disabled with no variations; Edit opens the existing edit sheet; VoiceOver announces "Approved, N left".
- Header: "N to review", "Writing cards… N waiting", Undo (disabled when nothing to undo), Finish.
- Done screen copy matches web; Finish with optional feedback; result shows counts and style notes; stale offers Discard.
- iOS inbox opens on the list with the summary and Start triage; opened from Add knowledge it goes straight into focus.
- Mac branch of the inbox and its keep/drop triage unchanged.

**Coding tasks:**
- [ ] Build focus-triage-card with variations, example, fact, note, actions
- [ ] Build focus-triage-done, focus-triage-result and focus-triage-view shell
- [ ] Build pending-review-inbox-summary with ready/waiting counts and Start
- [ ] Default iOS layout to list; keep macOS default triage
- [ ] Swap iOS full-screen cover to focus view; auto-open with onDone
- [ ] Build both schemes; manually walk SCENARIOS 1–5 and 7

**Notes:**
- Owns: `apps/ios/Sources/Shared/focus-triage-card.swift`, `focus-triage-done.swift`, `focus-triage-result.swift`, `focus-triage-view.swift`, `pending-review-inbox-summary.swift`, `PendingReviewScreen.swift`, `pending-review-layout.swift`.
- Depends on: A2.
- Use zoom helpers (`zoomFont`, `ZoomVStack`) like `pending-review-triage-view.swift`. Only the `#if os(iOS)` paths of `PendingReviewScreen.swift` change. Web reference: `apps/web/src/knowledge-bit/knowledge-bit-focus-card.tsx`, `knowledge-bit-focus-done.tsx`, `knowledge-bit-focus-shell.tsx`, `apps/web/src/card-triage/triage-feedback-panel.tsx`.

## Aspect A4 — Add knowledge: subject, link, refusals, straight to triage

**Goal:** adding knowledge from the iPhone matches the web: pick a subject, paste text or a link, see the server's reason when refused, add anyway for duplicates, then triage the new cards.

**Criteria:**
- Subject menu ("No subject" + subjects) shown only when no subject was passed in; course entry unchanged.
- A lone http(s) link is sent as a link; anything else as text.
- Refusal sentences shown per code; `already_added` shows Add anyway, which resends with force.
- Success text: "Questions take a minute or two to appear. Approve them on the next screen…"; Review new items opens the existing sheet.
- Mac Add knowledge still works (shared screen).

**Coding tasks:**
- [ ] Write add-knowledge-input classify tests and implement deriver
- [ ] Build add-knowledge-subject-picker loading subjects with failure fallback
- [ ] Wire picker, link sending, refusals and Add anyway into screen
- [ ] Smoke-test submit paths: text, link, refusal, force retry

**Notes:**
- Owns: `apps/ios/Sources/Shared/IngestionDictationScreen.swift`, `add-knowledge-input.swift`, `add-knowledge-subject-picker.swift`; `apps/ios/Tests/PostAnkiMacSmokeTests/add-knowledge-smoke-tests.swift`.
- Depends on: A1.
- Keep `init(topic:subjectId:)`, `reportsUnsentInput`, detect-bits kick and Mac offline/unauthorized messages. Opening focus directly is A3's job (onDone path); do not edit `PendingReviewScreen.swift`.

## Aspect A5 — Review: remaining New/Learning/Due counts

**Goal:** during review the user sees how many New, Learning and Due cards remain, lowering as they grade.

**Criteria:**
- Strip shows server counts minus graded this load: phase "new" lowers New, any other lowers Due, floor 0.
- Undo raises the matching count back; reload resets to server numbers; offline grades lower counts.
- One-line legend matches web wording.
- Existing review tests still pass; Mac review unchanged visually.

**Coding tasks:**
- [ ] Write review-remaining-counts tests and implement deriver
- [ ] Track server counts and graded phases in DueReviewModel files
- [ ] Build review-counts-strip and show it on iOS review screen
- [ ] Smoke-test counts through grade, offline grade, undo, reload

**Notes:**
- Owns: `apps/ios/Sources/Shared/review-remaining-counts.swift`, `review-counts-strip.swift`, `DueReviewModel.swift`, `DueReviewModel+Loading.swift`, `DueReviewModel+Grading.swift`, `DueReviewModel+Undo.swift`; `apps/ios/Sources/PostAnkiIOS/DueReviewScreen.swift`; `apps/ios/Tests/PostAnkiMacSmokeTests/review-remaining-counts-smoke-tests.swift`.
- Depends on: none.
- Web reference: `apps/web/src/knowledge-bit/anki-review-counts.tsx`, `anki-review-session.ts` (shiftTally).

## Aspect A6 — iPhone tab bar

**Goal:** Inbox, Add knowledge and Review are each one tap away on an iPhone.

**Criteria:**
- Exactly five tabs: Home, Review, Inbox (pending badge), Add, Courses — no More tab.
- Progress and the answer-practice ("Ingest") screen reachable from Home.
- Scene-active answer-queue flush kept.

**Coding tasks:**
- [ ] Reorder tabs; add Add tab wrapping knowledge screen in NavigationStack
- [ ] Add Home links to Progress and answer practice

**Notes:**
- Owns: `apps/ios/Sources/PostAnkiIOS/HomeView.swift`, `apps/ios/Sources/PostAnkiIOS/HomeScreen.swift`.
- Depends on: none (uses existing screens).

## Aspect A7 — Docs

**Goal:** iOS README and architecture doc describe the app as it now is.

**Criteria:**
- README lists iOS tabs and what each does; "Scaffolding only" gone.
- ARCHITECTURE "iOS shell" covers tabs, focus triage on iOS vs keep/drop on Mac, session store scoping.

**Coding tasks:**
- [ ] Update apps/ios README screens and status
- [ ] Update ARCHITECTURE iOS shell section

**Notes:**
- Owns: `apps/ios/README.md`, `apps/ios/docs/ARCHITECTURE.md`.
- Depends on: A1–A6.

## Manual steps
- [ ] Run local API and add sources to produce realistic pending cards

## Post-deploy checks
- [ ] On a device, triage, undo, finish with feedback against production

## Resolved
None yet.
