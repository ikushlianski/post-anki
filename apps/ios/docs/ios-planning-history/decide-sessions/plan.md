# Decide: challenge my thinking

## Goal
Covers the single coding task in `.planning/decide-sessions/todo.md`: describe a decision and where you lean, get a verdict with strengths, questions and blind spots, then flag each blind spot as a gap to revisit or dismiss it; browse past decisions. Mirrors web `apps/web/src/decide/decide.tsx` (route `apps/web/src/routes/decide.tsx`).

Batch 2, built second.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/learning-list/plan.md`. Dispatch: `apps/api/src/api-server.ts:656-661`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /decide-sessions` | `apps/api/src/router-table.ts:308`, `apps/api/src/decide/decide.controller.ts:14-37` | `{ decision, opinion }`, both trimmed, min 1 (`packages/shared/src/decide.ts:3`) | `DecideSession` (`decide.ts:44`) | 400 `invalid_input`, 502 `evaluator_unavailable` |
| `GET /decide-sessions` | `router-table.ts:309`, `decide.controller.ts:39-43` | none | `[DecideSession]` newest first, not paginated | none |
| `PATCH /decide-blind-spots/:id` | `router-table.ts:312`, `decide.controller.ts:45` | `{ status: "accepted"|"rejected" }` (`decide.ts:59`) | `DecideBlindSpot` (`decide.ts:32`) | 400, 404 `not_found` |

Shapes:
- `DecideSession`: `{ id, decision, opinion, verdict, strengths: [String], questions: [String], blindSpots: [DecideBlindSpot], createdAt }`.
- `DecideBlindSpot`: `{ id, description, status: "pending"|"accepted"|"rejected", resolvedAt? }`. The server does not stop a resolved spot from being changed again (`apps/api/src/decide/decide.repo.ts:108-130`).

## Dropped
Nothing; all three routes are used.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `Decide*`:
- `API/DecideModels.swift` (~35 lines), `API/APIClient+Decide.swift` (~35 lines, own file-private path helpers).
- `DecideModel.swift` (~90 lines), `DecideScreen.swift` (~140 lines), `DecideSessionView.swift` (~100 lines), `DecideHistoryScreen.swift` (~70 lines).

## Screens and behaviour
- Entry: `HomePracticeSection` (batch 2) row "Challenge my thinking" (`scalemass`) pushing `DecideScreen()`.
- `DecideScreen`: two multiline fields, "Decision" (placeholder "e.g. Should we move sessions from JWTs to server-side sessions?") and "Where you lean" ("Say where you currently lean and your reasoning."). Button "Challenge my thinking", disabled until both have non-blank text; shows "Evaluating..." while posting (can take tens of seconds). The draft stays on failure.
- Result (`DecideSessionView`): verdict, "Strengths", "Questions to ask yourself", "Blind spots". Pending blind spots show "Flag as a gap to revisit" (accepted) and "Dismiss" (rejected); resolved ones show "Flagged" or "Dismissed". The result replaces the form, with "New decision" to clear.
- Toolbar "History" pushes `DecideHistoryScreen`: rows with decision text (2 lines) and date; tap shows `DecideSessionView` for that session (blind spots still resolvable).
- Errors: 502 `evaluator_unavailable` "The reviewer is unavailable right now. Try again.", offline and 401 as the shared pattern (feature-local mapper). History: spinner, error with "Try again", empty "No decisions yet.", pull to refresh.

## Shared files
- `HomePracticeSection.swift` (batch 2, from learning-list): one row. No existing files change.

## Edge cases
- Blind-spot double tap: buttons disabled while that spot's PATCH is in flight; resolved spots show no buttons (UI guard, since the server allows re-resolve).
- 404 on a spot: "That item is gone." and reload history.
- Very long text: fields grow; no client cap beyond the server's.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: submit a decision on iOS, flag one blind spot and dismiss another, open web's decide page and see the same session with "Flagged"/"Dismissed".

## Defaults
- One screen for the form and the latest result; history behind a toolbar button.
- Resolved blind spots are final in the app.
