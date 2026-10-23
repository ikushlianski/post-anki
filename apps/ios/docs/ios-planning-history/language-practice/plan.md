# Language practice: phrase drills, phrase bank, writing checks

## Goal
Covers the single coding task in `.planning/language-practice/todo.md`: for a language-practice subject, pick level and topic pack, translate batches of Russian phrases into English and get graded, see the phrase bank (phrases being learned and mastered), and check a piece of free writing. Mirrors web `apps/web/src/routes/practice.$subjectId.tsx`, `apps/web/src/practice/batch-practice.tsx`, `apps/web/src/practice/phrase-bank-panel.tsx` and `apps/web/src/routes/practice.$subjectId_.check-writing.tsx`.

Batch 2, built third.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/learning-list/plan.md`. Dispatch: `apps/api/src/api-server.ts:744-757`. Every practice route returns 400 `not_a_language_practice_subject` unless the subject's `kind` is `language-practice` (`apps/api/src/practice/practice.controller.ts:15-27`).

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /subjects` | `apps/api/src/router-table.ts:15`, `apps/api/src/subject/subject.controller.ts:21-39` | none | `[Subject]` including `kind: "architecture-mentor"|"language-practice"` (`packages/shared/src/subject.ts:4-13`) | none |
| `GET /subjects/:id/practice-settings` | `router-table.ts:470`, `practice.controller.ts:29-38` | none | `{ subjectId, level: "A1_A2"|"B1_B2"|"C1_C2", pack: "General"|"StandupUpdates"|"CodeReview"|"IncidentPostmortems"|"GivingFeedback" }`; created on first read | 400 |
| `PATCH /subjects/:id/practice-settings` | `router-table.ts:476`, `practice.controller.ts:40-57` | `{ level?, pack? }` | settings | 400 |
| `POST /subjects/:id/phrase-batches` | `router-table.ts:482`, `practice.controller.ts:59-71` | no body; uses saved level and pack | `{ phrases: [Phrase] }` (10 per batch, `apps/web/src/practice/practice.constants.ts`) | 400; 500 when the generator returns nothing |
| `POST /subjects/:id/attempts` | `router-table.ts:488`, `practice.controller.ts:73-97` | `{ answers: [{ phraseId, userAnswer }] }` (min 1) | `{ attempts: [Attempt], phraseBankUpdates: [PhraseBankUpdate] }` | 400 |
| `GET /subjects/:id/phrase-bank` | `router-table.ts:494`, `practice.controller.ts:99-111` | none | `{ active: [PhraseBankEntry], mastered: [PhraseBankEntry] }` | 400 |
| `POST /subjects/:id/writing-checks` | `router-table.ts:500`, `practice.controller.ts:113-132` | `{ text }` trimmed, 1-5000 chars | `WritingCheck` | 400 |
| `GET /subjects/:id/writing-checks` | `router-table.ts:506`, `practice.controller.ts:134` | none | `[WritingCheck]` newest first (`apps/api/src/practice/writing-check.repo.ts:41-49`) | 400 |

Shapes (`packages/shared/src/practice.ts`, `packages/shared/src/phrase-bank.ts`):
- `Phrase`: `{ id, subjectId, batchId, level, pack, position, russian, referenceEnglish, domain, targetPhraseBankEntryId?, sequenceNumber, createdAt }`.
- `Attempt`: `{ id, subjectId, phraseId, userAnswer, score: Int (0-10), verdict: "Ok"|"NeedsReview"|"NeedsDeepDive", feedback, nativeAlternatives: [String], createdAt }`.
- `PhraseBankEntry`: `{ id, phraseText, category?, status: "new"|"practicing"|"struggling"|"mastered", masteryStage, correctCountInCycle, incorrectCountInCycle, notes?, masteredAt?, ... }` (other fields ignored). Updates carry `{ id, phraseText, category?, status, masteryStage, ... }`.
- `WritingCheck`: `{ id, subjectId, text, score, verdict, feedback, nativeAlternatives: [String], createdAt }`.

## Dropped
Nothing; all practice routes are used.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `Practice*`, `Phrase*`, `WritingCheck*`:
- `API/PracticeModels.swift` (~90 lines), `API/APIClient+Practice.swift` (~70 lines, own file-private path helpers; own `PracticeSubject { id, name, kind }` decode of `GET /subjects`, since the app's `Subject` has no `kind`).
- `PracticeSubjectsScreen.swift` (~70 lines): subject picker.
- `PracticeModel.swift` (~140 lines), `PracticeScreen.swift` (~170 lines), `PhraseCardView.swift` (~80 lines).
- `PhraseBankScreen.swift` (~90 lines).
- `WritingCheckModel.swift` (~70 lines), `WritingCheckScreen.swift` (~120 lines).

## Screens and behaviour
- Entry: `HomePracticeSection` (batch 2) row "Language practice" (`character.bubble`) pushing `PracticeSubjectsScreen`, which lists subjects with `kind == "language-practice"`. Exactly one subject skips the list and opens it. None: "No language practice subjects. Create one on the web."
- `PracticeScreen`: level and pack menus (labels from web: "A1-A2 Beginner", "B1-B2 Intermediate", "C1-C2 Advanced"; "General", "Standup updates", "Code review", "Incident postmortems", "Giving feedback"). Changing either PATCHes settings and fetches a new batch.
- Batch flow: on load, GET settings then POST a batch ("Generating your next batch of phrases..."). Phrases appear in chunks of 5 (web default): each `PhraseCardView` shows the Russian text and an answer field ("Your English translation..."). "Submit" is enabled when every phrase in the chunk has text and posts that chunk. Results under each card: "score/10 - verdict" ("Ok", "Needs review", "Needs deep dive"), feedback, native alternatives, and the reference English. Phrase-bank updates that reached `mastered` show a "Mastered: <phrase>" banner.
- "Continue" moves to the next chunk; after the last chunk "Next batch" requests a new one.
- Toolbar: "Phrase bank" pushes `PhraseBankScreen` (sections "Learning" and "Mastered"; row text, category, status label; empty "No phrases tracked yet."); "Check my writing" pushes `WritingCheckScreen`.
- `WritingCheckScreen`: multiline text field with a 5000-character counter; "Check" posts and shows score, verdict, feedback, alternatives; below, past checks newest first (tap to expand).
- States everywhere: spinner, error with "Try again", pull to refresh (practice screen: reloads settings and the phrase bank; it keeps the current batch and its answers).
- Errors: 400 `not_a_language_practice_subject` "This subject isn't set up for language practice."; generator failure (500) "Couldn't make phrases right now. Try again."; offline and 401 as the shared pattern.

## Shared files
- `HomePracticeSection.swift` (batch 2): one row. No existing files change.

## Edge cases
- Grading failure keeps the typed answers.
- Settings change mid-chunk with unsent answers: confirm "Discard this batch?".
- Writing text over 5000 chars or blank: Check disabled.
- The batch is not stored locally; leaving the screen drops unsent answers (same as web).

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: open a language-practice subject, translate a chunk of 5, see scores; change pack and get a new batch; open the phrase bank; run a writing check and see it in web's check-writing history.

## Defaults
- Chunks of 5, matching web's default.
- Entry is from Home only; Courses is not changed.
- Subject kind read via a feature-local subject decode instead of changing the shared `Subject` model.
