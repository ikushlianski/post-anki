---
type: plan-summary
branch: seed-knowledge-map
state: confirmed
updated: 2026-07-28
---

# Plan summary — Seed subjects and courses/topics (domain hierarchy + placement + knowledge map)

Real build, no source app to port from (unlike the four items before this one in the active build
queue). Unattended planning run — every genuine architectural fork (no safe/reversible default
available) resolved and reasoned explicitly below and in `discussion.md`; every other fork resolved
with a reversible default per this project's standing "recommended-default" rule. Scoped to GitHub
issue #48's own narrow "Done when," not the wishlist entry's broader phrasing and not the related
later items (#49 ecosystem scan, #52 priority review, #53 job-market scan, #56 ontology split/merge)
that come after this one in the same queue.

## What ships

- A new self-referential `domain_nodes` tree, one per subject, seeded with a starter hierarchy for
  the existing "Programming / Web Development" subject (Frontend / Backend / Cloud & DevOps /
  Architecture branches, ~14 nodes, 3 levels deep).
- Creating a curriculum now optionally places it in that tree: explicitly (pick an existing node in
  the tree UI), silently via an exact/normalized name match (no LLM call), or — only when neither
  applies — via a new cheap Mastra agent that proposes a parent position plus a bounded list of
  sibling/subtopic names, so the tree grows to include the space around the new topic, not just the
  topic itself (e.g. studying "Next.js" also seeds "Remix", "TanStack Start", "Nuxt.js" as sibling
  nodes, even though none of them have been studied).
- A new per-subject "domain map" page visualizes the tree; every node — studied or not — shows an
  approximate knowledge percentage, computed as a pure rollup over real stored topic-maturity data
  (no time-based decay, matching `.product/PRINCIPLES.md`).
- A curriculum's placement can be changed after the fact (re-pointed to a different existing node) —
  this is what makes the agent's "auto-apply, never block" design honest rather than a one-shot guess
  the user is stuck with.

## What this is not

- Not a restructuring of `subjects` (still flat, still 8 rows) or of the already-shipped
  `tags`/`tagAssignments` cross-cutting mechanism (untouched) — see `discussion.md`'s tags-vs-tree
  reasoning for why these stayed separate.
- Not re-parenting/splitting/merging of existing nodes — that's issue #56, the next item in this
  same queue.
- Not the periodic ecosystem-change scan that updates percentages from new external
  releases/versions — that's issue #49, explicitly deferred by the issue itself.
- Not a new "attach sources to an existing curriculum" feature — `mergeSourcesIntoCurriculum`
  already does this; this plan only builds the missing half (placing the curriculum correctly in
  the first place).

## Files

`.planning/seed-knowledge-map/spec.md`, `scenarios.md`, `discussion.md`, `architecture.md`,
`playwright.md`, `state-fixtures.md`. `architecture.md` is written (unlike the immediately preceding
port-type items in this queue that skipped it) because this plan introduces a new self-referential
data shape, a new agent, and a new orchestrator layer — a real structural addition, not a feature
bolted onto existing architecture.
