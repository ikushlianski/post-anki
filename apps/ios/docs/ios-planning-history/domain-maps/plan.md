# Domain maps: nodes, priorities, recommendations, mappings, refocus, suggestion triage

## Goal
Covers the single coding task in `.planning/domain-maps/todo.md`: for each subject, see its map of knowledge areas (how much of each area the learner's courses cover), set how deep each area matters, merge duplicate areas, ask for and triage priority suggestions, ask for and act on "what to learn next" recommendations, see and confirm which areas a course belongs to, triage document-scan suggestions, and dismiss "refocus this course" nudges.

Batch C, built first. This plan creates the batch-C Settings hub file (`SettingsToolsSection.swift`) that duplicate-review and admin-tools add rows to.

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
All routes sit behind the bearer check (`apps/api/src/api-server.ts:407-410`); errors are `{ "error": "<code>" }`, validation 400 `invalid_input`. Controllers: `dm` = `apps/api/src/domain-map/domain-map.controller.ts`, `dr` = `apps/api/src/domain-recommendation/domain-recommendation.controller.ts`, `cm` = `apps/api/src/curriculum-domain-mapping/curriculum-domain-mapping.controller.ts`, `cr` = `apps/api/src/curriculum/course-refocus.controller.ts`. Shapes in `packages/shared/src/domain-map.ts` unless noted.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /subjects/:id/domain-map` | `apps/api/src/router-table.ts:516-521`, `dm:31-38` | none | tree of `{ id, subjectId, parentId?, name, description?, order, percent, targetDepth?, priorityDistance?, curricula: [{ id, name }], children, supersededAt?, supersededReason?, source, kind? }` (`domain-map.ts:87-107`) | 404 |
| `PATCH /domain-nodes/:id` | `dm:42-64` | `{ targetDepth: "awareness"|"working"|"deep"|null }` (`domain-map.ts:128-132`) | node | 404 |
| `POST /domain-nodes/:id/merge` | `dm:71-96` | `{ sourceDomainNodeId }` (`:id` stays) (`domain-map.ts:322-326`) | `{ curriculaMoved, childNodesMoved }` (`domain-map.ts:328-332`) | 404, 400 `different_subjects`, `cycle` |
| `POST /subjects/:id/domain-priority-reviews` | `dm:103-119` | no body | `[DomainPrioritySuggestion]` (`domain-map.ts:142-157`) | 404, 502 `review_failed` (paid AI call) |
| `GET /subjects/:id/domain-priority-suggestions?status=pending` | `dm:122-142` | query `status` | `[DomainPrioritySuggestion]` | 404 |
| `PATCH /domain-priority-suggestions/:id` | `dm:150-170` | `{ status: "accepted"|"rejected" }` (`domain-map.ts:164-168`) | suggestion | 404, 409 `already_resolved` |
| `GET /subjects/:id/domain-priority-review-status` | `dm:176-184` | none | `{ lastReviewedAt?, due }` (`domain-map.ts:199-203`) | 404 |
| `POST /subjects/:id/doc-scans` | `dm:194-208` | no body | `DocScanResult` (`domain-map.ts:254-260`) | 404 (no tree), 502 (paid AI call) |
| `GET /subjects/:id/doc-scan-suggestions` | `dm:220-240` | none | `{ newTopics: [DomainTopicSuggestion], supersessions: [DomainSupersessionSuggestion] }` (`domain-map.ts:220-252, 307-311`) | 404 |
| `PATCH /domain-topic-suggestions/:id`, `PATCH /domain-supersession-suggestions/:id` | `dm:263-283`, `dm:286-306` | `{ status: "accepted"|"rejected" }` (`domain-map.ts:291-302`) | suggestion | 404, 409 |
| `POST /subjects/:id/domain-recommendations` | `dr:19-31` | no body | `[DomainRecommendation]` | 404 `no_domain_nodes`, `not_taxonomy_backed` (paid AI call) |
| `GET /subjects/:id/domain-recommendations` | `dr:34-52` | none | `[{ id, subjectId, domainNodeId, sourceNodeId, axis: "deepen"|"widen", reason, source, status, createdAt, resolvedAt?, createdCurriculumId? }]` | 404 |
| `PATCH /domain-recommendations/:id` | `dr:72-92` | `{ status: "accepted"|"rejected" }` | recommendation; accepting creates a new course (`createdCurriculumId`) | 404, 409 |
| `POST /curricula/:id/domain-mappings` | `cm:12-37` | no body | mappings | 404, 400 `subject_has_no_static_taxonomy`, 502 `mapping_failed` (paid AI call) |
| `GET /curricula/:id/domain-mappings` | `cm:40-45` | none | `[CurriculumDomainNodeMapping]` (`domain-map.ts:362-377`) | 404 |
| `PATCH /curriculum-domain-mappings/:id` | `cm:52-80` | `{ status: "confirmed"|"rejected", depth? }` (`domain-map.ts:385-390`) | mapping | 404 |
| `GET /course-refocus-suggestions` | `cr:5-13` | none | `[{ curriculumId, subjectId, subjectName, courseName, reason: "stale_top_priority"|"new_high_priority_ignored", dismissedAt? }]` (`packages/shared/src/curriculum.ts:331-345`) | none |
| `PUT /curricula/:cid/refocus-dismissals/:reason` | `cr:15-32` | none | `{ success: true }` | 404, 400 |

## Dropped
- Creating, renaming or deleting map areas (domain nodes): no such routes; the map is built by the server.
- Sibling discovery (`domain-map.ts:116`) and the global `POST /doc-scans` sweep: the sweep is an admin trigger (`.planning/admin-tools/plan.md`).
- Changing a course's placement through the legacy single `domainNodeId`: superseded by the mappings list above.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `DomainMap*`, `DomainNode*`, `DomainPriority*`, `DomainRecommendation*`, `DomainMapping*`, `DocScan*`, `CourseRefocus*`, `SettingsTools*`:
- `API/DomainMapModels.swift` (~120 lines) and `API/DomainSuggestionModels.swift` (~110 lines): all shapes above as `Decodable, Sendable, Hashable`, recursive `DomainNodeItem` as a final class or indirect children array.
- `API/APIClient+DomainMap.swift` (~90 lines: map, node, merge, mappings, refocus) and `API/APIClient+DomainSuggestions.swift` (~100 lines: priority, doc-scan, recommendations); own `encodedSegment` in each.
- `DomainMapModel.swift` (~140 lines), `DomainMapScreen.swift` (~160 lines: subject picker, tree), `DomainNodeScreen.swift` (~120 lines: depth, merge, courses), `DomainPriorityScreen.swift` (~130 lines), `DocScanScreen.swift` (~130 lines), `DomainRecommendationScreen.swift` (~130 lines), `DomainMappingScreen.swift` (~120 lines: per course), `CourseRefocusScreen.swift` (~90 lines).
- `SettingsToolsSection.swift` (~50 lines): batch-C Settings hub, a `Section("Tools")` with rows.

## Screens and behaviour
- Entry: `SettingsToolsSection()` in Settings below the Save/Remove section. Rows from this plan: "Knowledge maps" (`map`) and "Refocus suggestions" (`scope`).
- `DomainMapScreen`: subject picker (from `GET /subjects` via the existing `APIClient.listSubjects()`), then the tree as an outline (`OutlineGroup`-style disclosure), each area with coverage percent and target depth chip; superseded areas greyed with their reason. Toolbar menu: "Priority suggestions", "Document scan suggestions", "What to learn next".
  - `DomainNodeScreen`: depth picker (Not set / Awareness / Working / Deep) saved on change; its courses (push `DomainMappingScreen` for each); "Merge another area into this one" picker of same-subject areas, confirm "Merge <B> into <A>? Its courses and sub-areas move here and <B> is removed." (destructive).
- `DomainPriorityScreen`: review status ("Last reviewed <date>", "Review due"), pending suggestions with Accept/Reject, and "Run a priority review" (confirm "This uses an AI call."; 502: "The review failed. Try again later.").
- `DocScanScreen`: "Scan documents" (confirm, paid AI call), then "New areas" and "Replacements" lists with Accept/Reject.
- `DomainRecommendationScreen`: pending recommendations ("Go deeper"/"Branch out", reason), "Get recommendations" (confirm, paid AI call). Accept confirms "Accepting creates a new course for <area>." and then offers "Open course", which looks up `createdCurriculumId` in `listCurricula()` and pushes `CurriculumDetailScreen`.
- `DomainMappingScreen` (one course): its mappings with area name, status, depth; Confirm (with depth picker) or Reject; "Suggest areas" (confirm, paid AI call; `subject_has_no_static_taxonomy`: "This subject has no map yet.").
- `CourseRefocusScreen`: undismissed suggestions ("<course> in <subject>": "Its area is your top priority but you haven't studied it lately" / "A new high-priority area isn't covered"), each with "Open course" and "Dismiss" (no confirm; reversible by the server's next run).
- All triage buttons treat 409 `already_resolved` as "Already handled." and reload.

## Shared files
Re-read before editing; one added line via targeted `Edit`.
- `Sources/PostAnkiIOS/SettingsScreen.swift`: in the `Form`, on the line after the `Section { Button("Save") ... Button("Remove token") ... }` closing brace (currently line 90), add `SettingsToolsSection()`. Settings is pushed inside Home's `NavigationStack`, so the rows can push. No other batch edits this file.

## Edge cases
- Subjects without a map: "No map for this subject yet." and the scan/recommend buttons hidden.
- Recursive tree depth: rendered lazily by disclosure; no limit needed.
- Paid AI triggers disable their button while running and on success.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: open a subject's map, set a depth, accept a priority suggestion, accept a recommendation and open its new course, confirm a course mapping, dismiss a refocus suggestion.

## Defaults
- Knowledge maps live under Settings > Tools, not as a tab.
- Every paid AI call and every merge asks first; accept/reject triage does not, except accepting a recommendation (it creates a course).
