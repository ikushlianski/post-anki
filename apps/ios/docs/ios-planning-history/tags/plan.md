# Tags: browse, mastery, tag a topic, merge

## Goal
Covers the single coding task in `.planning/tags/todo.md`: see all tags with how well each is mastered, open a tag to see the topics and modules it covers, add a tag to a topic, and merge a duplicate tag into another. Mirrors web `apps/web/src/routes/tags.tsx`, `apps/web/src/subject/tag-list.tsx`, `apps/web/src/curriculum/tag-picker.tsx`.

Batch 2, built fourth (last).

## API contract (verified, server repo `/Users/ikushlianski/webdata/ilya-projects/post-anki`)
Bearer check and error format as in `.planning/learning-list/plan.md`. Dispatch: `apps/api/src/api-server.ts:716-729`. Controller `apps/api/src/tag/tag.controller.ts`.

| Call | Wired | Request | Response | Errors |
|---|---|---|---|---|
| `GET /tags` | `apps/api/src/router-table.ts:404`, `tag.controller.ts:13-17` | none | `[Tag]` `{ id, name, normalizedName }` (`packages/shared/src/tag.ts:8-12`) | none |
| `GET /tags/mastery` | `router-table.ts:405`, `tag.controller.ts:19-23` | none | `[{ tagId, name, status: "new"|"practicing"|"struggling"|"mastered" }]`; tags never practiced are "new" (`apps/api/src/tag/tag.repo.ts:318-328`) | none |
| `GET /tags/:id/nodes` | `router-table.ts:408`, `apps/api/src/search/search.controller.ts:85-89` | none | `{ nodes: [{ id, kind: "topic"|"module"|"bit", title, curriculumId?, curriculumName?, rank, tags: [{ id, name }] }], capped: Bool }` (`packages/shared/src/search.ts:31-46`) | none |
| `POST /tags` | `router-table.ts:412`, `tag.controller.ts:25-39` | `{ name }` (min 1) | **201** `Tag`; returns the existing tag for a matching name | 400 |
| `POST /tags/:id/assignments` | `router-table.ts:415`, `tag.controller.ts:41-61` | `{ nodeType: "module"|"topic"|"knowledgeBit", nodeId }` (`tag.ts:4,44-47`) | **201** `TagAssignment` `{ id, tagId, nodeType, nodeId, createdAt }` | 400, 404 `tag_not_found` |
| `POST /tags/:id/merge` | `router-table.ts:425`, `tag.controller.ts:78-103` | `{ sourceTagId }` (`tag.ts:51`); `:id` is the tag kept | `{ targetTagId, sourceTagId, assignmentsMoved, assignmentsDeduped, sessionsMoved }` (`tag.ts:57-63`) | 400 `self_merge`, 404 `not_found` |

## Dropped
- `POST /knowledge-bits/tagging-scan`: operator scan.
- `DELETE /tags/:id/assignments/:assignmentId` (`router-table.ts:421`): needs the assignment id, which only comes with a topic's tag chips (`packages/shared/src/topic.ts:44`); the app's `Topic` does not carry them and the nodes response has no assignment ids. A later ticket can add removal once topic tags are loaded.
- Tag quizzes (`/probe/tag/$tagId` on web): tag-scoped probe sessions are out of the quiz-sessions plan's topic scope.

## Files
New (under `Sources/PostAnkiIOS/`), prefix `Tag*`:
- `API/TagModels.swift` (~45 lines), `API/APIClient+Tags.swift` (~45 lines, own file-private path helpers).
- `TagsModel.swift` (~80 lines), `TagsScreen.swift` (~120 lines), `TagDetailScreen.swift` (~100 lines), `MergeTagSheet.swift` (~70 lines).
- `TopicTagSection.swift` (~90 lines): "Tags" section for the topic hub with an "Add tag" sheet.

## Screens and behaviour
- Entry 1: `HomePracticeSection` (batch 2) row "Tags" (`tag`) pushing `TagsScreen`.
- Entry 2: topic hub, `TopicTagSection(topic:)` at the bottom of `TopicStudyScreen`'s list.
- `TagsScreen`: GET tags and mastery in parallel; rows by name with a mastery chip; search field filters locally. Tap pushes `TagDetailScreen`. Swipe "Merge into..." opens `MergeTagSheet`.
- `TagDetailScreen`: nodes grouped "Topics", "Modules", "Knowledge bits"; row title and course name. Topic rows push `TopicStudyScreen(topic:)` (read-only reuse), building `Topic` from `listCurricula()` + curriculum detail lookups only when tapped; if not found "Couldn't open this topic." `capped` shows "Showing the first results only."
- `MergeTagSheet`: pick the tag to keep; confirm "Merge <source> into <target>? <source> is removed." On success: "Moved n tags" summary and reload.
- `TopicTagSection`: "Add tag" opens a sheet with existing tags (search) plus "Create '<text>'". Picking posts the assignment (creating first when new); tags added this visit show as chips. 404 `tag_not_found` reloads tags.
- States: spinner, error with "Try again", empty "No tags yet.", pull to refresh on the list and detail.

## Shared files
Re-read before editing; targeted `Edit`.
- `TopicStudyScreen.swift`: one line, `TopicTagSection(topic: topic)`, as the last item inside the `List` (after the Notes section). Batch 1 inserts its line after `Section("Study")`, a different spot.
- `HomePracticeSection.swift` (batch 2): one row.

## Edge cases
- Assigning a tag already on the topic: the server returns the assignment; the chip is not duplicated.
- Merging a tag into itself: target picker excludes the source.
- Offline: offline message; nothing queued.

## Verification
No test target. `xcodegen generate`, simulator `xcodebuild` exits 0. Manual: add a new tag to a topic on iOS, open Tags and see it, open it and see the topic; merge two tags and see one remain on web's tags page.

## Defaults
- Removing a tag from a topic is left out (see Dropped).
- Merge lives behind a swipe action with a confirm.
