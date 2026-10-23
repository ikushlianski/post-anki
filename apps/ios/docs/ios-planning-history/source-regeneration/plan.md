# Regenerate a knowledge source and generate more question variants

## Goal
Covers the single coding task in `.planning/source-regeneration/todo.md`: from the Review tab, ask the server to throw away a source's pending items and extract them again, watch it finish, and see the new items; from an item's detail screen, ask for more question variants of that item.

Batch A, built fifth (last).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/daily-push/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /knowledge-sources/:id/regeneration` | `apps/api/src/router-table.ts:20-25`, `apps/api/src/api-server.ts:500-501`, `apps/api/src/knowledge-source/knowledge-source-regeneration.controller.ts:18-61` | `{}` (optional `modelId`, `packages/shared/src/knowledge-bit.ts:42-44`) | **202** `{ status: "running", supersededCount: Int }` (`knowledge-bit.ts:48-51`) | 404 `not_found`, 409 `already_running`, 422 `source_text_missing` (`knowledge-source-regeneration.controller.ts:15`) |
| `GET /knowledge-sources/:id/regeneration` | `router-table.ts:26-31`, `api-server.ts:502-503`, `knowledge-source-regeneration.controller.ts:64-76` | none | `{ status: "running"|"done"|"failed", failureReason: String? }` (`knowledge-bit.ts:54-57`, `apps/api/src/knowledge-source/knowledge-source-regeneration.repo.ts:77-101`) | 404 `not_found` |
| `POST /knowledge-bits/:id/variants` | `router-table.ts:388-393`, `api-server.ts:703-704`, `apps/api/src/knowledge-bit/knowledge-bit-generate-variants.controller.ts:8-24` | no body | **202** `{ ok: true }`; generation runs in the background | 404 `not_found` |

- Regeneration supersedes the source's current pending items at once (`supersededCount`), then extracts again in the background.
- The knowledge source id the app already has is `PendingReviewSource.knowledgeSourceId` (`Sources/PostAnkiIOS/API/PendingReviewModels.swift:3-10`); the item id is `KnowledgeOverviewItem.id` (`Sources/PostAnkiIOS/API/KnowledgeManageModels.swift:3-12`).

## Dropped
- Model choice for regeneration (`modelId`): no route lists the allowed models, so the app sends `{}` and the server's default applies.
- Showing the source's full text: web calls `GET /knowledge-sources/:id/text`, which is not in `router-table.ts`; nothing to call.
- Knowing when new variants are ready: the variants call has no status route; the app says they are on their way.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `SourceRegen*` and `MoreVariants*`:
- `API/SourceRegenModels.swift` (~25 lines): `SourceRegenStartResult`, `SourceRegenStatus`, `MoreVariantsResult { ok }`, `SourceRegenInput` (empty encodable).
- `API/APIClient+SourceRegen.swift` (~35 lines): `regenerateKnowledgeSource(id:)`, `knowledgeSourceRegeneration(id:)`, `generateMoreVariants(bitId:)`; own `encodedSegment`.
- `SourceRegenModel.swift` (~90 lines), `SourceRegenerationRow.swift` (~70 lines).
- `MoreVariantsSection.swift` (~60 lines).

## Screens and behaviour
- Entry 1: in the Review tab, each source section gets a last row `SourceRegenerationRow(sourceId:onFinished:)`: button "Regenerate items" (`arrow.clockwise`). Tap opens a confirm: "Regenerate items from this source? Its N pending items are replaced with new ones." (destructive role). Confirm posts; the row then shows "Regenerating... replaced N items" with a spinner and polls the status every 3 seconds, stopping after 5 minutes ("Still working. Pull to refresh later.").
  - `done`: calls `onFinished` (the Review screen reloads its list) and shows "New items are ready."
  - `failed`: "Regeneration failed: <failureReason or 'unknown reason'>." with "Try again".
  - 409 `already_running`: switch straight to polling. 422 `source_text_missing`: "This source has no saved text to extract from." 404: "This source no longer exists."
- Entry 2: item detail screen gets `MoreVariantsSection(bitId:)` as its last section: button "Generate more question variants". Tap posts (no confirm; it only adds). Then "New variants are being generated. They show up in review within a minute or two." The button stays disabled for this visit.
- Polling uses a `Task` cancelled on disappear.

## Shared files
Re-read before editing; one added line each via targeted `Edit`.
- `Sources/PostAnkiIOS/PendingReviewScreen.swift`: inside the per-source `Section { ... }`, on the line after the closing brace of `ForEach(source.bits) { ... }`, add `SourceRegenerationRow(sourceId: source.id) { Task { await model.load() } }`.
- `Sources/PostAnkiIOS/KnowledgeItemDetailScreen.swift`: add `MoreVariantsSection(bitId: item.id)` as the last item inside `List`, after the section holding the suspend button.
No other batch edits these files.

## Edge cases
- Reloading the Review list while regenerating removes the superseded items; the source section may vanish until new items exist, which also removes the row and cancels its polling. Acceptable: new items appear on the next reload.
- Offline during polling: keep polling until the 5-minute stop; show the offline message once.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: regenerate a pending source, see the count, wait for "New items are ready" and new items in the list; generate variants for an item and see them in review later.

## Defaults
- Regeneration asks first (it replaces pending items); generating more variants does not (it only adds).
- Poll every 3 seconds for up to 5 minutes.
