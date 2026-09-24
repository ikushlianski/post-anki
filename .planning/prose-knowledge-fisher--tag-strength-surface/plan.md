# Plan — tag-strength-surface (Surface strong/weak/shallow by tag and topic)

## Goal
Let the learner see, per tag, whether they're strong (mastered), weak (struggling), shallow
(practicing, not yet mastered), or untested (new) — using `getTagMasteryLevels`
(apps/api/src/tag/tag.repo.ts), already shipped and reviewed PASS this run.

## Reuse-check / scope narrowing (done before writing code, per advisor consult)
- **Topic side already exists.** `apps/web/src/curriculum/topic-row.tsx` already renders each
  topic's `progressMaturity` (the existing gap-derived signal). "By topic" in the backlog line is
  already satisfied by shipped UI — NOT rebuilt here. Non-goal, explicit.
- **Tag side is the actual new work.** `apps/web/src/routes/tags.tsx` + `apps/web/src/subject/
  tag-list.tsx` already list every tag with a link to `/probe/tag/$tagId` — this item adds a
  strength badge to that existing list, not a new page.
- **Vocabulary**: `MasteryStatus` from `packages/core/src/mastery/mastery-state.ts` is already
  `"new" | "practicing" | "struggling" | "mastered"` — reuse these four words directly as the
  labels (mapped for display: new -> "untested", practicing -> "shallow", struggling -> "weak",
  mastered -> "strong"). No new vocabulary invented.
- **Zero-attempt tags must not vanish.** `getTagMasteryLevels` leaves a tag with no attempts out of
  its returned map (by design, per its own docstring) — the endpoint built here starts from
  `listTags()` and fills in the default "new" entry for any tag missing from the map, so every tag
  the learner has ever created shows up with a real status.
- **`foldTagMastery`'s binary correct/incorrect already flattens `NeedsReview` and `NeedsDeepDive`
  into the same `false`** — that's an existing, already-reviewed design decision from the
  tag-mastery item, not reopened here. "Shallow" in THIS item's UI means mastery status
  `"practicing"` (some corrects, not yet at the mastery threshold), not a finer-grained verdict
  breakdown — no new query needed.

## Non-goals
- No change to `topics.progressMaturity` or its write path (item 73 stays blocked, untouched).
- No change to `foldTagMastery`/`getTagMasteryLevels` themselves (reused as-is).
- No new page/route — extends the existing `/tags` page only.
- No recommendation/deepen-advice logic — that's the next backlog item.

## Design
1. **Phase 1 — endpoint.** New repo/controller/route: `GET /tags/mastery` returning
   `{ tagId, name, status }[]` for every tag (via `listTags()` joined with
   `getTagMasteryLevels(allTagIds)`, defaulting a map miss to `status: "new"`). Follow this
   codebase's existing controller/route-table conventions (see `router-table.ts:253-254` for the
   existing `/tags` entries).
2. **Phase 2 — UI.** Add a strength badge to each tag chip in `apps/web/src/subject/tag-list.tsx`
   (`strong`/`shallow`/`weak`/`untested`, from the new endpoint via `@tanstack/react-query`).
   Write a RED Playwright test first (per this repo's e2e conventions) asserting the badge text
   for a seeded tag at each of the four statuses, then implement until green, then `/check-ui` in
   a real browser before marking Phase 2 done.

## Files by scenario
| Scenario | Files |
|---|---|
| Endpoint returns every tag with a status, including untested ones | new repo function (tag.repo.ts
or a new tag-mastery-surface file), controller, router-table.ts entry, tests |
| UI shows a strength badge per tag | tag-list.tsx, a new e2e spec, `apps/web/src/curriculum/
curriculum.api.ts` or a new api-client function |
