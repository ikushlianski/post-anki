## The ask
Root todo items 15+16 together: a knowledge-item inbox screen — approve (with a gesture),
edit, and reassign-deck actions. ("Postpone" is out of scope here — see Assumption below.)

## Real API contract (source, not live — prod isn't deployed yet)
- `GET /knowledge-bits/placement-suggestions` → `PendingPlacementSuggestion[]`
  (`{ id, body, placementSuggestion }`) — the inbox list
  (post-anki apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts:139-145,
  packages/shared/src/knowledge-bit.ts:3-7). `placementSuggestion` is a free-text AI suggestion
  (e.g. "Marketing > Positioning"), not a moduleId — the human still picks the real module.
- `PATCH /knowledge-bits/:id/placement-suggestion` — resolve one item
  (detect-knowledge-bits.controller.ts:166-192, packages/shared/src/knowledge-bit.ts:10-17):
  - accept: `{ status: "accepted", moduleId: string, title: string }` — `title` doubles as the
    "edit" action (send an edited title instead of the original body/suggestion).
  - reject: `{ status: "rejected" }`.
  - 409 if already resolved by someone else (race with itself or another client) — treat as
    "already handled," remove from the local list, don't show an error.
- Already wired: `GET /curricula`, `GET /curricula/:id` (modules+topics) — reuse for the
  module picker.

## Assumption — postpone and "Unassigned" are not server-backed
No due-date/defer field exists on this endpoint, and there's no "Unassigned" bucket — accept
always requires a real `moduleId`. Root todo's "postpone" sub-action and "Auto-assign... falling
back to Unassigned" (item 17) are out of scope for this unit; flagged to post-anki-c7 (see
existing message) as a possible future field. This unit builds approve/edit/reassign only.

## What to do
1. `APIClient.listPlacementSuggestions()` → `GET /knowledge-bits/placement-suggestions`.
2. `APIClient.resolvePlacementSuggestion(id:accepted:moduleId:title:)` → `PATCH
   /knowledge-bits/:id/placement-suggestion`, encoding the accepted/rejected discriminated body.
3. New `KnowledgeItemInboxScreen` + `KnowledgeItemInboxModel` (`@Observable @MainActor`): a List
   of pending items (body preview + AI's placementSuggestion text). Tapping a row opens a detail
   sheet with an editable title field, a module picker (built from `listCurricula` +
   `getCurriculumDetail`), Approve and Reject buttons.
4. Swipe-to-approve gesture on each list row (SwiftUI `.swipeActions`) using the row's existing
   `placementSuggestion` text as the title and requiring the module to already be resolvable —
   if no confident module match, swipe-approve opens the detail sheet instead of blind-approving
   (never silently assign the wrong deck).
5. Add an "Inbox" tab or nav link from Home/Courses to this screen (your call on placement —
   follow the existing tab bar pattern in `PostAnkiIOSApp.swift`/`HomeView.swift`).

## Files by scenario
| Scenario | Files |
|---|---|
| See pending knowledge items in the inbox | new KnowledgeItemInboxScreen.swift, APIClient.swift |
| Swipe to approve with the AI-suggested placement | KnowledgeItemInboxScreen.swift |
| Open detail, edit title, pick a different module, approve | KnowledgeItemInboxScreen.swift |
| Reject an item | KnowledgeItemInboxScreen.swift |

## Done when
Builds clean via real `xcodebuild` (Swift 6 strict concurrency — don't regress), installs and
launches in the simulator. Simulator tap-screenshot verification is currently broken in this
environment (Accessibility permission not granted to the session's AppleScript process — noted
in root todo.md) — verify reachability via code inspection (nav wiring citation) instead, and
say so explicitly rather than claiming a live screenshot. Cannot verify a real list/approve
round-trip — prod API isn't deployed.

## Guardrails for whoever implements this
- Do NOT `git checkout`/`git restore` anything in `Sources/` — real, uncommitted `@MainActor`
  fixes are in place on the existing model classes.
- New model class follows the same `@Observable @MainActor` pattern as the existing ones.
- Don't invent a postpone or "Unassigned" API call — neither exists server-side; see Assumption.
