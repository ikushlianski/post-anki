---
type: plan
branch: learn-from-doc-site
task: iOS basic post-anki — triage, add knowledge, inbox, review
state: confirmed
updated: 2026-10-24
---
# Plan: iOS basic post-anki

Brings the iPhone app to the web's "basic post-anki" loop by filling gaps only. The idea it hinges on: the iPhone triage becomes the web's focus mode (Approve keeps the whole card, Reject drops it, each tap is a server write, Undo restores any decided card), built as shared models that the Mac test suite can exercise but wired only into the iOS shell. Deliberate non-changes: no server or web change, no migration, no new dependency, Mac triage untouched.

**Legend:** ➕ add · ✏️ change · ➖ remove

## 1. Business rules
- `FocusTriageQueue.build`: first card with at least one question is current unless a pinned card is still pending; cards with no questions count as waiting, never current.
- `FocusTriageDecisionLog`: newest decision is undone first; decisions made before the session started are excluded; list capped at 500; accepted = approved count.
- `FocusTriageNote.trimmed` 500 chars, `FocusTriageFeedback.trimmed` 8,000 chars, empty → nothing sent.
- `FocusTriageSubject.single`: subject id only when every source with cards shares it.
- `FocusTriagePollPlan`: poll every 8 s while waiting > 0, stop after 40 attempts.
- `AddKnowledgeInput.classify`: whole trimmed input is one http(s) URL → link, else text.
- `KnowledgeSourceRefusal.from`: `fetch_failed`, `empty_content`, `subject_not_found`, `subject_has_children`, `already_added`, `text_too_long` → web sentences.
- `ReviewRemainingCounts`: New minus graded new-phase cards, Due minus graded other cards, Learning as served, floor 0, reset on reload.

## 2. Services (Swift API package)
| | File | What it does |
|---|---|---|
| ➕ | `triage-session-client.swift` | `startTriageSession(subjectId:)` → `POST /triage-sessions`; `finishTriageSession(id:feedbackText:decisions:)` → `POST /triage-sessions/:id/finish`; `gradeKnowledgeBit(id:rating:note:)` → `POST /knowledge-bits/:id/grades`; `updateKnowledgeBitFeedbackNote(id:note:)` → `PATCH /knowledge-bit-feedback/:id` |
| ➕ | `triage-session-models.swift` | session response, decision `{bitId, verdict}`, style note, inputs |
| ➕ | `knowledge-source-add-client.swift` | `addKnowledgeSource(text|url, subjectId, force)` → `POST /knowledge-sources` |
| ➕ | `knowledge-source-refusal.swift` | refusal enum + sentences + mapping from `APIError.badStatus` code |
| ✏️ | `PendingReviewModels.swift` | optional `subjectId` on pending sources |

## 3. API endpoints (consumed, all existing)
| | Method | Path | Purpose | Errors handled |
|---|---|---|---|---|
| | POST | `/knowledge-bits/:id/approve` | approve all variations | 409 no_variant, 409 blocked / 404 → decided elsewhere, offline, 401 |
| | POST | `/knowledge-bits/:id/reject` | reject, returns feedbackId | same |
| | POST | `/knowledge-bits/:id/restore` | undo either verdict | 404/409 → can't undo; offline → retry |
| ➕ | POST | `/knowledge-bits/:id/grades` | note on approve (rating 3) | failure → note-not-saved notice |
| ➕ | PATCH | `/knowledge-bit-feedback/:id` | note on reject | same |
| ➕ | POST | `/triage-sessions` | start session | failure → triage works, no feedback |
| ➕ | POST | `/triage-sessions/:id/finish` | decisions + feedback | 404/409 → stale, Discard; other → keep text, retry |
| ✏️ | POST | `/knowledge-sources` | add text or link, optional force | refusal codes above |

## 4. Client state
- ➕ `FocusTriageModel` (Shared, `@Observable @MainActor`): wraps the existing pending list model; per-tap writes; pinned current; per-card note; decision log; bounded polling via the list's `load()`; badge via the existing count store.
- ➕ `FocusTriageSessionModel`: start on open, resume from store, finish/discard, phases idle → writing → saving → result.
- ➕ `focus-triage-session-store.swift`: UserDefaults entry `{server, sessionId, decisions}`; ignored when the server address differs.
- ✏️ `DueReviewModel` + `+Loading`, `+Grading`, `+Undo`: keep server counts and graded phases.

## 5. Frontend
| | Where | Change |
|---|---|---|
| ➕ | `Sources/Shared/focus-triage-card.swift` | variations open, example, Fact, AI label, source disclosure, note, Reject/Approve, Edit |
| ➕ | `Sources/Shared/focus-triage-view.swift` | header counts, Undo, Finish; hosts card/done/result |
| ➕ | `Sources/Shared/focus-triage-done.swift`, `focus-triage-result.swift` | done copy + feedback; result counts + style notes; Discard when stale |
| ➕ | `Sources/Shared/pending-review-inbox-summary.swift` | ready/waiting summary + Start triage |
| ✏️ | `Sources/Shared/PendingReviewScreen.swift` | iOS: summary above list, focus cover, auto-open when shown from Add knowledge; Mac untouched |
| ✏️ | `Sources/Shared/pending-review-layout.swift` | iOS default list, macOS default triage |
| ✏️ | `Sources/Shared/IngestionDictationScreen.swift` + ➕ `add-knowledge-input.swift`, `add-knowledge-subject-picker.swift` | subject menu, link sending, refusals, Add anyway, success copy |
| ➕ | `Sources/Shared/review-remaining-counts.swift`, `review-counts-strip.swift` | counts deriver + strip with legend |
| ✏️ | `Sources/PostAnkiIOS/DueReviewScreen.swift` | show strip |
| ✏️ | `Sources/PostAnkiIOS/HomeView.swift` | tabs: Home, Review, Inbox (badge), Add, Courses |
| ✏️ | `Sources/PostAnkiIOS/HomeScreen.swift` | links to Progress and answer practice |

## 6. Tests
- Package contract tests: every new request's path/method/body, both session fixtures decode, refusal mapping, `subjectId` optional decoding.
- Mac smoke tests (compile Shared): focus queue and decision log rules; approve/reject/undo/notes/polling against FakeServer; session start/resume/finish/stale and server scoping; add-knowledge classify, refusals and force retry; review counts through grade, offline grade, undo and reload.
- Files: ➕ `triage-session-contract-tests.swift`, `knowledge-source-add-contract-tests.swift`, fixtures `triage-session.json`, `triage-session-finished.json` (package); ➕ `focus-triage-smoke-tests.swift`, `focus-triage-session-smoke-tests.swift`, `add-knowledge-smoke-tests.swift`, `review-remaining-counts-smoke-tests.swift` (Mac smoke target).
- Both schemes build; existing suites stay green.

## 7. Docs
- ✏️ `apps/ios/README.md`: iOS tabs and screens.
- ✏️ `apps/ios/docs/ARCHITECTURE.md`: iOS shell tabs, focus triage vs Mac triage, session store scoping.

## Out of scope
- Mac adopting focus triage; style notes screen; bury/suspend, celebration, card chat in review; multi-block paste, model choice, earlier-duplicate link; global Approve all, regeneration changes; iPad shortcuts and swipe; reworking the answer-practice screen; any `apps/api` or `apps/web` change.
