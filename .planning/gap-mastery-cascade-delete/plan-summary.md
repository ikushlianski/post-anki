---
type: plan-summary
branch: gap-mastery-cascade-delete
task: "Clean up orphaned gap_mastery rows left behind by gap/topic/module/curriculum deletion"
complexity: medium
state: confirmed
updated: 2026-07-30
---

# Plan summary: gap_mastery cascade delete

**Complexity: Medium**
**Reason:** Touches four call sites across three repository files (`topic.repo.ts`,
`module.repo.ts`, `curriculum.repo.ts` ×2) plus a new integration test proving DB state — more than
a one-line fix, but the shape is obvious from reading the code (no new UI, no new service boundary,
no ambiguity in business behavior).
**Planning path:** Full planning (spec + scenarios + playwright.md + state-fixtures.md), no
architecture.md (no architectural shift), grill-me skipped — no human present tonight; every fork
in this plan had a safe, pattern-following default (see spec.md "Decisions made autonomously").

## What this plan covers

One scenario: deleting a gap — directly (its parent topic is deleted), or transitively via its
parent module or curriculum being deleted — now also deletes the gap's `gap_mastery` row, in the
same DB transaction. Proven by a real-Postgres integration test, not a Playwright browser test —
there is no UI-observable difference this bug produces (every reader already joins through `gaps`),
so a browser-driven e2e test structurally cannot detect it either way.

## Cold-start note

No pre-existing `/plan-ie` plan or `.planning/gap-mastery-cascade-delete/` content existed before
this run — this is a fresh `/plan-playwright` plan, not a bridged one.
