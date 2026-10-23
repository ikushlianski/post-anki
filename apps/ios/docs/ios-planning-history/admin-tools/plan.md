# Admin tools: settings, observability, pipeline scan triggers

## Goal
Covers the single coding task in `.planning/admin-tools/todo.md`: let the owner look at the server's admin settings and health (stuck course builds, recent AI calls, recent merges, approval rates per AI model) and start the background scans by hand. Read-only for settings; every trigger asks first.

Batch C, built third (last). Adds one row to `SettingsToolsSection.swift` (created by domain-maps).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/domain-maps/plan.md`. `kb` = `apps/api/src/knowledge-bit/detect-knowledge-bits.controller.ts`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /admin/settings` | `apps/api/src/router-table.ts:328`, `apps/api/src/admin-settings/admin-settings.controller.ts:9-13` | none | `{ testToggle, modelTier: "cheap"|"balanced"|"premium", knowledgeItemModelId }` | none |
| `GET /admin/observability` | `router-table.ts:330`, `apps/api/src/admin-observability/admin-observability.controller.ts:9-34` | none | `{ stuckCurricula: [{ id, name, status, stuckForMs }], recentEvents: [{ id, curriculumId?, curriculumName?, op, agentKey, durationMs, success, errorMessage?, promptTokens?, completionTokens?, totalTokens?, createdAt }], recentMerges: [{ id, entityType, targetId, targetName, sourceId, sourceName, reassignedCounts, createdAt }] }` | none |
| `GET /admin/knowledge-bit-feedback/by-model` | `router-table.ts:187`, `apps/api/src/knowledge-bit/knowledge-bit-feedback.controller.ts:78-80` | none | `{ models: [{ modelId, approved, rejected, topReasons: [{ reasonCode, count }] }] }` | none |

Scan triggers (all `POST`, no body, 502 `scan_failed` on failure; result decoded with a tolerant summary of top-level numbers and booleans):

| Trigger | Wired | What it does | Risk |
|---|---|---|---|
| Detect knowledge items | `kb:20-32` | extracts items from new sources | paid AI call |
| Item embeddings | `kb:35-50` | embeds items | paid AI call |
| Tagging | `kb:52-67` | assigns tags to items automatically | paid AI call; **changes data** (destructive styling) |
| Placement | `kb:69-84` | places items under topics | paid AI call |
| Question generation | `kb:86-102` | writes question variants | paid AI call |
| Fill-in-the-blank cards | `kb:104-120` | writes cards | paid AI call |
| Basic cards | `kb:122-138` | writes cards | paid AI call |
| Variant embeddings | `kb:140-156` | embeds variants | paid AI call |
| Card embeddings | `apps/api/src/cards/cards.controller.ts:66-80` | embeds cards | paid AI call |
| Business-education distill | `apps/api/src/biz-education-distiller/content-inbox.controller.ts:14-26` | writes distilled facts and content-inbox rows | paid AI call; **changes data** (destructive styling) |
| Document scan, all subjects | `apps/api/src/domain-map/domain-map.controller.ts:213-217` | creates map suggestions for triage | paid AI call |

Paths confirmed in `router-table.ts`: detect items `POST /knowledge-sources/detect-bits` (`:19`), distill `POST /biz-education-distills` (`:238`), card embeddings `POST /cards/embedding-scan` (`:266`), document scan `POST /doc-scans` (`:564`). The seven other knowledge-item scans are routed to the `kb` handlers listed above; the implementer copies each path string from the router entry whose handler name matches (not re-listed here because their entries use regex patterns that were not captured during planning). **To verify** before building that row group.

## Dropped
- Changing admin settings (`PATCH /admin/settings`, `router-table.ts:329`): excluded by the read-only rule in the todo.
- Auto-defer sweep (`apps/api/src/gap/gap.controller.ts:189`): changes gap states for every topic in bulk; a scheduler job, not a scan, and not trigger-safe.
- `/mcp` and `/electric` routes: protocol endpoints, not admin screens.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `Admin*`:
- `API/AdminModels.swift` (~80 lines): `AdminSettings`, `AdminObservability`, `AdminStuckCourse`, `AdminEvent`, `AdminMerge` (`reassignedCounts` as `[String: Int]`), `AdminModelFeedback`, `AdminScanSummary` (custom `init(from:)` keeping numeric/bool fields).
- `API/APIClient+Admin.swift` (~50 lines): `adminSettings()`, `adminObservability()`, `adminFeedbackByModel()`, `adminRunScan(path:)`.
- `AdminScan.swift` (~50 lines): the trigger list (title, path, explanation, `changesData` flag).
- `AdminModel.swift` (~110 lines), `AdminScreen.swift` (~160 lines), `AdminScansScreen.swift` (~110 lines).

## Screens and behaviour
- Entry: row "Admin" (`wrench.and.screwdriver`) in `SettingsToolsSection`.
- `AdminScreen`: sections "Settings" (read-only labels: AI tier, item model, test toggle), "Stuck course builds" (name, status, "stuck for 2h 5m"), "Recent AI calls" (op, agent, course, duration, tokens, red when failed with the error message), "Recent merges" (type, "<source> into <target>", counts), "Item approval by model" (approved/rejected, top reject reasons). Link "Run scans". Pull to refresh.
- `AdminScansScreen`: one row per trigger with its explanation. Tap always opens a confirm dialog: "Run <name>? This uses paid AI calls." Rows with `changesData` use the destructive role and add "It changes your data." While running the row shows a spinner and other triggers stay enabled; result "Done: <summary>" or "Scan failed."

## Shared files
None outside batch C. `SettingsToolsSection.swift` (batch C): one row.

## Edge cases
- Unknown `modelTier` value from a newer server: decoded as a plain string.
- Long-running triggers: the request may take minutes; the app waits with the spinner and does not retry.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: open Admin and compare with web's admin page; run "Item embeddings" and see the summary.

## Defaults
- Settings shown read-only.
- Every trigger asks first; two are styled destructive.
