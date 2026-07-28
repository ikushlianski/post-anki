---
type: discussion
branch: seed-knowledge-map
state: confirmed
updated: 2026-07-28
---

# Discussion — Seed subjects and courses/topics

Unattended run. No human interview happened — this file records the self-conducted grill-me pass
(walking the plan's own assumptions the way a second reviewer would) plus a written record of the
`advisor` tool's second-pass review, which surfaced two real gaps before scenarios.md was finalized.
Every fork below either had a safe, reversible default (chosen and logged) or was a genuine
architectural fork with no safe default (chosen, reasoned, and flagged for the user's own review in
the final report — this project's standing "recommended-default rule" only licenses proceeding
without a question when a safe default exists; it does not mean the fork goes undocumented).

## Branch-defining fork 1 — reuse `tags` or build a new hierarchy?

**No safe default — genuine architectural fork.** Resolved: new `domain_nodes` table. Full reasoning
in `spec.md`'s decision 1. The sharpest version of why, from the advisor's review: `tag_assignments`
is unique on `(tagId, nodeType, nodeId)`, built for one node carrying many tags and one tag spanning
many unrelated branches simultaneously. A domain hierarchy's entire placement mechanism depends on
each node having exactly one parent — the opposite invariant. There is no version of "reuse tags"
that doesn't either break that invariant (multi-parent nodes) or bolt on a discriminator column that
makes every future read ask "is this a domain node or a cross-cutting tag." The issue's own
2026-07-18 comment already draws this exact line (cross-cutting → tags; domain structure →
hierarchy), so this isn't just an inferred preference — it's stated intent.

## Branch-defining fork 2 — where does the hierarchy sit relative to `subjects`/`curricula`?

**No safe default — genuine architectural fork.** Three shapes were considered:
1. Fold `subjects` into the new hierarchy (subject = root node). Rejected: touches 8 existing,
   load-bearing rows (`kind`, `requireSources`, every `curricula.subjectId` reference, every UI
   surface that lists subjects) for zero benefit this plan's scope needs — the issue's own "Done
   when" only asks for one pre-seeded domain, not a subject-model rewrite.
2. Make `curricula` self-nestable (`parentCurriculumId`) — treat "Meta-frameworks" as a curriculum
   too. Rejected: a `curriculum` row carries `status`/`learningStatus`/`speed`/`hinting`/
   `defaultDepth`/`strictOrder`/sources/pre-assessment — an entire "generate and study this" state
   machine that a pure organizational grouping node ("Meta-frameworks" itself is never probed, never
   generates content) has no use for. Forcing it through would mean every curriculum-shaped feature
   built from here on has to remember to special-case "is this actually a group, not a course."
3. **Chosen: a new tree hangs beneath each subject** (`domain_nodes.subjectId`, `parentId` nullable
   self-ref), with `curricula.domainNodeId` as the one connecting, nullable, additive column.
   Subjects and curricula keep their exact current shape and behavior; the tree is purely additive.

## Branch-defining fork 3 — bidirectional or one-directional node↔curriculum link?

Considered giving `domain_nodes` its own `curriculumId` column (bidirectional with
`curricula.domainNodeId`). Rejected during drafting, before this became a real fork worth escalating:
two FKs pointing at each other for the same relationship is a drift risk (which one is authoritative
when they disagree?) for no query-pattern benefit — tree assembly needs "all nodes for a subject" +
"all curricula for a subject with a domainNodeId", both single flat queries either way. One-
directional (`curricula.domainNodeId` only) also naturally allows more than one curriculum attaching
to the same node later (e.g. "Next.js basics" + "Next.js deep dive") with zero schema change, which a
bidirectional 1:1-shaped link would have made awkward. Safe default, not escalated.

## Independent leaf 1 — does placement run for every subject or only ones with a tree?

**Cost-awareness mandate makes this a safe default, not a fork.** Running placement (normalized
match + agent) unconditionally would mean 7 of 8 existing subjects — none of which have any tree
today — start firing a new LLM call on every single curriculum creation, for a feature whose own
scope this run is limited to "programming." Gating on "subject already has ≥1 `domain_nodes` row"
makes the other 7 subjects' behavior providably unchanged (a regression risk this run has no time to
manually verify across every subject, so removing the risk architecturally is the safer choice).
Logged as decision 6 in `spec.md`.

## Independent leaf 2 — how does the agent refer to existing nodes?

**Safe default, matches established codebase pattern.** Names + resolved paths, never raw ids —
every other content-generating agent in this codebase (curriculum-architect, doc-research-architect)
already returns titles/names for the LLM to author, with the app resolving/creating the actual rows;
none of them ask an LLM to echo a database key. Same pattern here.

## Independent leaf 3 — what happens when the agent call fails or returns low-confidence?

Originally drafted as two separate cases (agent explicitly signals "not confident" vs. an infra
failure), with the low-confidence case triggering a blocking user prompt. **Revised during drafting,
before finalizing scenarios.md:** asking an LLM to self-report "I'm not confident" reliably is itself
an unreliable mechanism (models are not well-calibrated at refusing when actually uncertain), and a
blocking prompt would contradict `.product/PRINCIPLES.md`'s "System selects — user never manages a
queue" the same way a mandatory approval gate would. Simpler, safer version adopted instead: the
agent always proposes *a* placement (that's its whole job); the only fallback path is a genuine
call failure (network/timeout/schema-invalid output), caught and treated as "leave it unplaced,
exactly like today" — zero new UI, zero blocking, fully reversible via "change placement" regardless
of which of the two ever happens. This simplified SCENARIO 6 to a pure backend/integration proof with
no FE surface at all.

## Independent leaf 4 — percentage rollup: average of child percentages, or flatten all descendant topics?

**Advisor-flagged, resolved with reasoning, not left as a coin flip.** Average-of-children was the
first draft; rejected because it double-averages unpredictably depending on tree shape (one studied
leaf among nine unstudied siblings would read very differently depending on how deep the "studied"
leaf sits and how its siblings are grouped). Flatten-every-descendant-topic-then-average (reusing
`moduleProgress` unmodified) gives every leaf topic equal weight regardless of tree position — a
single, tree-shape-independent rule. SCENARIO 2's second test case (uneven topic counts per branch,
[100] vs [0,0,0] → 25%, not the 50% a naive branch-average would produce) is specifically designed to
distinguish the two strategies and prove the chosen one is what's actually implemented.

## Independent leaf 5 — is "change placement" in scope, or a stretch beyond the issue's literal ask?

The issue's own "Done when" doesn't name it. It's in scope anyway, as a **direct consequence of
decision 5** (auto-apply placement, never block): a design that "auto-applies and is correctable" is
not actually correctable unless correcting it is buildable. Kept deliberately minimal — a plain field
update via the *existing* `PATCH /curricula/:id`, never a new endpoint, never a node-restructuring
capability (that boundary belongs to issue #56, explicitly out of scope here). This keeps the
addition small enough that it doesn't creep into the next queued item's territory.

## Advisor second-pass findings (both incorporated before scenarios.md was finalized)

1. **Missing the one scenario a reviewer checks first.** The initial scenario draft covered seeding,
   explicit/agent placement, and rollup math, but never explicitly proved the issue's own headline
   claim — that an untouched node still exists in the map at a real 0%, not hidden or blank. Added as
   SCENARIO 7, marked mandatory per the task's own instruction.
2. **SCENARIO 5 (percentage updates from live probing) as originally scoped would have been an
   expensive, flaky e2e for pure math.** Split into: SCENARIO 2 (the math itself, unit-tested against
   hand-picked maturity values, no DB/UI at all) and SCENARIO 8 (the rendering/rollup-wiring proof,
   using additive-seeded topic data rather than a live probe-and-wait session).

## Consistency gate — run inline against the finished artifacts

1. **Scenario → Acceptance.** All 9 scenarios have an `Acceptance` block; every block names BE/FE/
   Infra explicitly (backend-only scenarios 1/2/6 mark FE `None` outright by omitting the section
   header entirely, per their own "why not e2e" framing — treated as an explicit `None`, not a blank).
   PASS.
2. **Scenario → e2e box.** SCENARIOS 3, 4, 5, 7, 8, 9 each carry exactly one unchecked
   `[ ] @seed-knowledge-map.S<N> — e2e test written` line. SCENARIOS 1, 2, 6 carry unit/integration
   test-file checkboxes instead, consistent with their "not e2e" framing stated up front in each.
   PASS.
3. **Scenario → state contract.** Every scenario has a matching entry in `state-fixtures.md` naming
   concrete state (seeded tree, seeded curricula/topics where relevant), a setup-role split
   (subject/scenery), a state source, and a reseed strategy. PASS.
4. **Scenario → action map.** `playwright.md`'s scenario→action/testid map covers all 6 e2e
   scenarios; every action gap (`addCourseUnderNode`, `changePlacement`) appears in the consolidated
   gaps table with its used-by list; no scenario composes an action absent from both the existing
   surface and the gaps table. PASS.
5. **Diagram → scenario/architecture.** The one Mermaid diagram (in `architecture.md`) depicts the
   placement decision flow described in decision list items 1-8 of `spec.md` and referenced directly
   by SCENARIOS 3/4/5/6 — not decorative. PASS.
6. **Deriver → scenario.** The one pure-logic deriver flagged for unit testing (`domainNodeProgress`)
   names SCENARIO 2, which exists. No deriver forced per-scenario elsewhere (e2e-first framing). PASS.
7. **Documentation.** `architecture.md` was written (new self-referential data shape, new agent, new
   orchestrator layer — meets this project's own trigger list); `spec.md`'s Documentation changes
   section commits to publishing `docs/architecture/seed-knowledge-map.md` during implementation,
   since no existing doc covers this area. Not left blank. PASS.
8. **Constitution + framework safety.** No contradiction found: migrations generated-never-pushed
   (spec.md's Data model section states this explicitly), no scenario seeds its own subject-under-test
   (every e2e scenario's Setup role section names the front-door subject explicitly), no scenario
   targets a forbidden/shared environment (post-anki has no such target — Postgres-only, local e2e
   stack), no scenario is parked as a future `test.skip`. PASS.
9. **Open questions carried.** None outstanding — see `playwright.md`'s "Open questions" section,
   which is empty and states why. PASS.

**Consistency gate: PASS — spec.md / scenarios.md / playwright.md / state-fixtures.md / architecture.md
promoted to `state: confirmed`.** No gaps found; no re-drafting cycle was needed.
