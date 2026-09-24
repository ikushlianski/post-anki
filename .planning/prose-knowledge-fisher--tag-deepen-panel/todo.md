# Local todo — tag-deepen-panel

## Decisions to make
- None open — domain_recommendations reuse explicitly ruled out (schema/accept-semantics
  mismatch), read-time pull-only list chosen instead. See plan.md.

## To review-clarify
- None open.

## Coding tasks
- [x] Component: filter GET /tags/mastery to struggling/practicing, link into answer screen
- [x] Wire into /tags page
- [x] Tests: RTL component test

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, no new endpoint.

## Resolved
- Shipped: apps/web/src/subject/tag-deepen-list.tsx (new), filters listTagMasteryStatuses to
  struggling/practicing, links each to /knowledge/answer?tagId=, quiet empty-state message, no
  accept/reject/badge. Wired into apps/web/src/routes/tags.tsx above TagList. tsc clean, 3 RTL
  tests green (all 4 scenarios covered). Commit dc3da87.
