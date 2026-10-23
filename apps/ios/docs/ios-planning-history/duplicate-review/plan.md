# Duplicate review: subjects and sources

## Goal
Covers the single coding task in `.planning/duplicate-review/todo.md`: run a scan for subjects that look like duplicates and merge or reject each pair, and run a scan for course sources that look like duplicates and acknowledge or dismiss each pair.

Batch C, built second. Adds one row to `SettingsToolsSection.swift` (created by domain-maps).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/domain-maps/plan.md`. `sd` = `apps/api/src/subject-duplicate/subject-duplicate.controller.ts`, `xd` = `apps/api/src/source-duplicate/source-duplicate.controller.ts`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `POST /subject-duplicate-scans` | `sd:18-32` | no body | `{ suggestions, embeddedCount, reusedCount, capped }` | 502 `scan_failed` (paid embedding call) |
| `GET /subject-duplicate-suggestions?status=pending` | `sd:35-53` | query `status` | `[{ id, subjectAId, subjectBId, similarity, reason, source, status: pending|accepted|rejected|stale, ... }]` | none |
| `PATCH /subject-duplicate-suggestions/:id` | `sd:62-98` | `{ status: "accepted", targetSubjectId }` (merges the other subject into the target) or `{ status: "rejected" }` | suggestion | 404, 409 `already_resolved`, 400 `invalid_target` |
| `POST /source-duplicate-scans` | `xd:18-30` | no body | scan summary | 502 `scan_failed` |
| `GET /source-duplicate-suggestions?status=pending` | `xd:33-51` | query `status` | `[{ id, sourceAId, sourceBId, similarity?, matchKind: "url_match"|"embedding_similarity", reason, status, ... }]` | none |
| `PATCH /source-duplicate-suggestions/:id` | `xd:58-84` | `{ status: "acknowledged"|"dismissed" }`; never merges or deletes | suggestion | 404, 409 |
| `GET /subjects` | `apps/api/src/router-table.ts:15` | none | subject names for the pair rows | none |
| `GET /sources` | `router-table.ts:230`, `apps/api/src/content-library/content-library.controller.ts:7-11` | none | source title/value and course names for the pair rows | none |

## Dropped
- Merging or deleting duplicate sources from this screen: the source-duplicate PATCH only records the decision. Deleting one copy is available in the source library (`.planning/source-library/plan.md`); this screen does not call delete.

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `DuplicateReview*`, `SubjectDuplicate*`, `SourceDuplicate*`:
- `API/DuplicateReviewModels.swift` (~70 lines): `SubjectDuplicateSuggestion`, `SubjectDuplicateResolveInput`, `SubjectDuplicateScanResult`, `SourceDuplicateSuggestion`, `SourceDuplicateResolveInput`, `DuplicateReviewScanSummary` (tolerant), `DuplicateReviewSourceName { id, curriculumName, title?, value }` (own decode of `GET /sources`).
- `API/APIClient+DuplicateReview.swift` (~70 lines); own `encodedSegment`.
- `DuplicateReviewModel.swift` (~140 lines), `DuplicateReviewScreen.swift` (~60 lines: segmented Subjects/Sources), `SubjectDuplicateList.swift` (~120 lines), `SourceDuplicateList.swift` (~110 lines).

Read-only reuse: `APIClient.listSubjects()` for names, `StudyToolsError`.

## Screens and behaviour
- Entry: row "Duplicates" (`square.on.square`) in `SettingsToolsSection`.
- Subjects: pending pairs "<A> and <B>", similarity percent, reason. Actions: "Keep <A>" / "Keep <B>" each confirm "Merge <other> into <kept>? Its courses move over and <other> is deleted." (destructive) and send `accepted` with that target; "Not duplicates" sends `rejected`. Toolbar "Scan" (confirm "This uses an AI call."; result "Found N possible duplicates.").
- Sources: pending pairs with both sources' titles (or values) and course names, "Same link" or similarity percent, reason. "Acknowledge" and "Dismiss" (no confirm; neither changes data). Toolbar "Scan".
- 409: "Already handled." and reload. Names missing from the lookup show "(removed)".

## Shared files
None outside batch C. `SettingsToolsSection.swift` (batch C): one row.

## Edge cases
- A pair whose subject was merged elsewhere becomes `stale` on the server; only `pending` is listed.
- `invalid_target` (target not in the pair): cannot happen from the UI; shown as a generic error.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: create two near-identical test subjects, scan, merge, and see one remain on the Courses tab; scan sources and dismiss a pair.

## Defaults
- Pending only; no history view.
- Subject merges always ask first.
