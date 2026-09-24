# Plan — tag-deepen-panel (Extend the existing deepen-recommendation flow to tag-level strength, pull-only)

## Why NOT the existing `domain_recommendations` table/UI (advisor consult, before writing code)
The backlog line says "extend the existing deepen-recommendation flow," which names
`domain_recommendations` / `RecommendationPanel` (`.planning/90-deepen-widen-recommendations/
spec.md`). Checked whether a tag-strength producer can plug into that table via its existing
`source` seam — it structurally cannot, for three independent reasons:
1. `domain_node_id` is NOT NULL on every row — tags have no domain node or subject of their own.
2. The unique `(subject_id, domain_node_id)` suppression is permanent and shared across every
   producer — a tag-based row would collide with, or be silently suppressed by, an unrelated
   structural rejection.
3. Accept always calls `createCurriculum(researchTopic=...)`, creating a NEW course. A weak tag's
   material already lives in existing curricula — "accept" would create a duplicate course instead
   of pointing the learner back at material they already have.
Making the table fit would mean a schema change plus a new accept branch — Guarded tier, rewrites
an already-reviewed contract, and conflates "start something new" (structural deepen/widen) with
"go revisit what you're weak at" (tag strength), which are genuinely different actions. Logged as
a human call, not attempted here.

## What this item actually builds instead
A **read-time, pull-only** list of tags the learner is currently weak or shallow on, each linking
directly into the answer screen (shipped this run) scoped to that tag — no new table, no
accept/reject, no due-count badge anywhere (learning-brain's pull-only rule).

## Design
- No new endpoint — `GET /tags/mastery` (shipped, reviewed PASS) already returns every tag's
  `status`.
- New small component (e.g. `apps/web/src/subject/tag-deepen-list.tsx`) rendered on the existing
  cross-cutting `/tags` page (`apps/web/src/routes/tags.tsx`) — tags are cross-subject, so this is
  the correct home, not the subject-scoped recommendations page.
  - Filters `listTagMasteryStatuses()`'s result to `status in ("struggling", "practicing")`.
  - Renders each as a plain link to `/knowledge/answer?tagId=<tag.id>` with the tag name and a
    plain-language label ("weak"/"shallow", reusing the same labels the tag-strength badge already
    uses).
  - Empty case (nothing struggling/practicing): a quiet one-line message, not an empty section
    header — never a red/urgent visual treatment (pull-only, no pressure).
- No accept/reject, no persisted "seen" state, no polling/refresh badge.

## Non-goals
- No change to `domain_recommendations`, `RecommendationPanel`, or the subject-scoped
  recommendations route.
- No new backend endpoint.
- No notification/badge/count anywhere outside this one pull page.

## Files by scenario
| Scenario | Files |
|---|---|
| Tags page shows a pull-only list of weak/shallow tags linking to the answer screen |
`apps/web/src/subject/tag-deepen-list.tsx` (new), `apps/web/src/routes/tags.tsx`, a co-located RTL
test |
