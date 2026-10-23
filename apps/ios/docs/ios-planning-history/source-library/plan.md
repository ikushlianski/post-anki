# Source library and content inbox

## Goal
Covers the single coding task in `.planning/source-library/todo.md`: see every source (links, pasted text, research pages) across all courses with where it belongs and whether its page was fetched, re-fetch a link whose page failed, delete a source, and read the content inbox (distilled facts that did not match any topic, with their suggested placement).

Batch A, built third. Adds rows to `HomeDailySection.swift` (created by daily-push).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/daily-push/plan.md`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /sources` | `apps/api/src/router-table.ts:230`, `apps/api/src/api-server.ts:875-876`, `apps/api/src/content-library/content-library.controller.ts:7-11` | none | `[LibrarySource]` (`packages/shared/src/content-library.ts:11-23`) | none |
| `POST /sources/:id/refetch` | `router-table.ts:231-236`, `api-server.ts:877-878`, `content-library.controller.ts:14-34` | no body | `{ sourceId, outcome: "ok"|"blocked"|"http_error"|"network_error", lastFetchedAt, fetchedTextUpdated }` (`content-library.ts:42-47`) | 404 `not_found`; 400 `not_refetchable` (only link sources with a URL) |
| `DELETE /sources/:id` | `router-table.ts:229`, `api-server.ts:580-581`, `apps/api/src/curriculum/curriculum.controller.ts:487-499` | none | `{ id, deleted: true }` | 404 `not_found` |
| `GET /content-inbox` | `router-table.ts:237`, `api-server.ts:879-880`, `apps/api/src/biz-education-distiller/content-inbox.controller.ts:7-11` | none | rows `{ id, body, sourceRef, suggestedPlacement, createdAt }`, newest first (`apps/api/src/db/schema.ts:1066-1072`, `apps/api/src/biz-education-distiller/distiller.repo.ts:61-63`) | none |

`LibrarySource`: `{ id, curriculumId, curriculumName, subjectId, subjectName, kind, value, title: String?, fetchState: "fetched"|"stale_failed"|"never_fetched", lastFetchedAt: String?, lastFetchOutcome: String?, createdAt }`.

## Dropped
- Acting on a content-inbox row (accept the placement, dismiss): no server route exists; the inbox is read-only.
- `POST /biz-education-distills` (fills the inbox): a pipeline trigger, owned by `.planning/admin-tools/plan.md`.
- Adding sources: belongs to course building (`.planning/course-building/plan.md`).

## Files
New (under `Sources/PostAnkiIOS/`), prefixes `SourceLibrary*` and `ContentInbox*`:
- `API/SourceLibraryModels.swift` (~45 lines): `SourceLibraryItem`, `SourceLibraryRefetchResult`, `SourceLibraryDeleteResult`, `ContentInboxItem`.
- `API/APIClient+SourceLibrary.swift` (~40 lines): `librarySources()`, `refetchLibrarySource(id:)`, `deleteLibrarySource(id:)`, `contentInbox()`; own file-private `encodedSegment`.
- `SourceLibraryModel.swift` (~110 lines), `SourceLibraryScreen.swift` (~150 lines), `ContentInboxScreen.swift` (~80 lines).

## Screens and behaviour
- Entry: rows "Source library" (`books.vertical`) and "Content inbox" (`tray`) in `HomeDailySection`'s "Find and import" section.
- `SourceLibraryScreen`: sources grouped by subject, then course (section header "Subject · Course"). Row: title or the value (link host + path, text cut to two lines), a kind label ("Link", "Text", "Research", "llms.txt"), and a fetch badge: "Fetched <relative date>", "Fetch failed (<outcome>)", or "Not fetched". A `.searchable` filter matches title, value, course and subject locally.
  - Swipe "Re-fetch" only on link sources. Shows a spinner on the row; result message: ok "Page updated." or "Page unchanged." (by `fetchedTextUpdated`), blocked "This site blocks fetching.", http_error "The site returned an error.", network_error "Couldn't reach the site." Then reload the list.
  - Swipe "Delete" (destructive) opens a confirm: "Delete this source from <course>? Lectures and research for that course will no longer use it." Confirm calls delete and removes the row; 404 removes the row silently.
- `ContentInboxScreen`: rows with the body (four lines, tap expands), "Suggested: <suggestedPlacement>", source ref in caption, date. Empty: "Nothing in the inbox."
- States: spinner, error with "Try again", pull to refresh.

## Shared files
None outside batch A. `HomeDailySection.swift` (batch A): two rows.

## Edge cases
- 400 `not_refetchable` (text or research source reached via a stale row): "Only links can be re-fetched."
- Deleting the last approved source of a course still being built is allowed by the server; the confirm copy covers it.
- Re-fetch and delete on the same row are disabled while either is running.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: re-fetch a link and see the badge change; delete a test source and confirm it is gone from the course's sources on web; open the inbox.

## Defaults
- Grouped by subject and course, newest first inside a course.
- Delete always asks first.
