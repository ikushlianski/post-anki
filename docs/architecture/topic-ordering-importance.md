---
type: architecture
branch: topic-ordering-importance
task: Promote/demote modules and topics, per-node comments, and AI-decided strict document order
state: confirmed
updated: 2026-07-15
---
# Architecture: Topic ordering & importance

## What changes structurally

**No new services, no new async boundary.** `priority` is a new column on the existing `modules`
and `topics` tables, updated through the existing `updateModule`/`updateTopic` request path — no
new mutation route for promote/demote itself. `strict_order` is a new column on `curricula`, set
once by the existing doc-research synthesis call (`researchCurriculum`) and editable via the
existing `updateCurriculum` route. The one genuinely new piece of backend surface is a small
comment log (`node_feedback`) with two thin nested-resource routes. The one genuinely new piece of
domain logic is a pure sort deriver that replaces two inline `.sort()` calls already in
`curriculum.repo.ts`.

**Promote/demote piggybacks on fields that already round-trip end-to-end, rather than inventing a
new mutation surface.** `updateModuleInput`/`updateTopicInput` already carry `title`, `order`,
`learningStatus`/`included`/`selfGrade`/`depth` as independently-optional fields, all landing on
the same `PATCH /modules/:id` / `PATCH /topics/:id` routes. `priority: z.number().int().min(-1).max(1).optional()`
is one more field in that same shape — no new route, no new controller function, the existing
`updateModule`/`updateTopic` repo functions just gain one more column to conditionally set. This
also means the web mutation hooks (`useToggleTopicIncluded`-style patterns in
`curriculum.mutations.ts`) can follow an established pattern rather than a novel one.

**Display order becomes a two-input composition (`order`, `priority`) gated by one curriculum-level
flag (`strict_order`), computed by one new pure deriver.** Today, `buildModules` in
`curriculum.repo.ts` sorts modules and topics inline by `a.order - b.order`. This plan extracts
that into `sortForDisplay<T extends { order: number; priority: number }>(items, strict): T[]`
(`packages/core/src/curriculum/ordering.ts`) — pure, unit-tested, and used for both the
modules-within-curriculum sort and the topics-within-module sort. When `strict` is true, it behaves
exactly like today's inline sort (order only, priority ignored). When `strict` is false, it groups
by `priority` descending, then by `order` ascending within each group — promoted items float up,
demoted items sink down, and the user's manual arrangement within a priority tier survives
untouched. `curriculum.repo.ts` is the only call site; it now reads the curriculum's `strict_order`
column alongside the row it already fetches and threads it into `buildModules`.

**Strict-order is a per-curriculum decision made once, at doc-research synthesis time, not
inferred client-side.** `docResearchPlanSchema` (`apps/api/src/curriculum/curriculum-research-plan.ts`)
gains a top-level `strictOrder: boolean` field, sibling to `modules`. `doc-research-architect.agent.ts`'s
instructions gain explicit guidance: tutorial-style, step-building documentation (a "getting
started" walkthrough where step 2 depends on step 1) → `true`; reference-style documentation with
no natural learning sequence → `false`. `researchCurriculum` persists this onto the new `curricula`
row via a small extension to the existing curriculum-creation write path — no new write, one more
column on an insert that already happens. The pasted-material `curriculum-architect.agent.ts` is
untouched (per this plan's explicit scope boundary) — its curricula simply keep the column's
default (`false`), which is exactly today's un-opinionated behavior for that pipeline.

**Manual reorder is the override mechanism — no new drag-and-drop or per-curriculum "unlock"
button is built.** The existing `reorderModules`/topic-reorder mutations already write directly to
`order`, and `order` is exactly what strict-mode display sorts by. A learner who wants to override
a strict sequence uses the buttons that already exist; this plan adds nothing new there. The one
new UI control genuinely needed for override is the `strict_order` toggle itself (SCENARIO 8) —
without it, a learner who wants *priority-driven* (not just manually-nudged) ordering on a
strict-origin curriculum would have no way to opt back into that behavior.

**Node comments (`node_feedback`) are deliberately a dead-end log, not a memory feed.** Unlike the
sibling `question-feedback-memory` plan, nothing in this plan's scope reads `node_feedback` back
into an LLM prompt — the task's own framing only asked for module/topic feedback to influence
*display order* and *recommendation*, both of which are served entirely by `priority`, not by
freeform comment text. Building a second retrieval-and-inject pipeline for text nobody consults
would be scope creep against the task's own words.

## New infrastructure

None.

## Data model evolution

Drizzle-generated migration, three additive changes:

```
modules
  + priority   integer NOT NULL default 0   -- -1 demoted, 0 neutral, 1 promoted

topics
  + priority   integer NOT NULL default 0   -- same tri-state

curricula
  + strict_order   boolean NOT NULL default false

node_feedback (new table)
  id          text PK
  node_type   text NOT NULL       -- 'module' | 'topic'
  node_id     text NOT NULL       -- app-enforced reference, no DB FK (same polymorphism
                                   -- rationale as the sibling plan's item-feedback table)
  comment     text NOT NULL       -- unlike item feedback, a comment-less row has no
                                   -- reason to exist here (promote/demote already IS the
                                   -- structured signal; this table exists only for text)
  created_at  timestamptz NOT NULL default now()
```

No changes to `probe_session_questions`, `socratic_turns`, `gaps`, or any table the sibling
`question-feedback-memory` plan touches — the two plans' migrations are independent and
order-agnostic. No changes to `topic-study-experience`'s in-flight schema work either.

## Failure modes

- **A curriculum's `strict_order` flag and a topic's `priority` disagree with the learner's
  expectation** (e.g. they promoted a topic on a strict curriculum, saw no reorder, and don't
  understand why). Mitigated at the UI level, not the data level: when `strict_order` is true, the
  promote/demote controls render with a short inline note ("strict order — promotions won't
  reorder until you turn this off") rather than behaving identically to the non-strict UI with no
  explanation. This is a UI/copy decision, not a new mechanism.
- **Doc-research synthesis omits `strictOrder` or returns a malformed value.** Same defensive
  pattern already used for `level` elsewhere in this pipeline: default to `false` (the safe,
  already-existing behavior) rather than rejecting the whole synthesis result over one optional-ish
  field.
- **A learner promotes every topic in a module** (all `priority: 1`). Display order degrades
  gracefully to "all promoted, so order-only within that single tier" — not a bug, just the
  natural consequence of the tri-state design; no special-casing needed since the sort composition
  already handles a group of any size, including "everything."
- **`node_feedback` grows unbounded over the life of a curriculum.** Accepted — it's a personal,
  low-volume log with no read amplification concern (nothing queries it in a hot path; it's only
  ever read for direct display of that node's own comment history, if a UI for that is ever built).
  Not addressed by this plan since it's out of scope (SCENARIO 5).

## Rollout

Single deploy, no feature flag — every new column defaults to today's exact behavior (`priority: 0`
sorts identically to today's plain `order` sort; `strict_order: false` also sorts identically to
today). Apply the generated migration before deploying the API build that reads/writes the new
columns. No coordination needed with the sibling `question-feedback-memory` migration or
`topic-study-experience`'s in-flight migration — all three touch disjoint tables/columns.
