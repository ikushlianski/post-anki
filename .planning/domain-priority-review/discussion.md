---
type: discussion
branch: domain-priority-review
state: confirmed
updated: 2026-07-28
---

# Discussion — Per-domain expertise priority + monthly re-prioritization review

This is an unattended planning run (grand-loop-style — no human review step exists for this pass).
This file records the reasoning behind every judgment call, including the one genuine
dependency-sequencing fork this item's own issue text raises, and the consistency-gate log.

## The scope-now-vs-defer fork (the one real fork in this plan)

Issue #52's mechanism section explicitly says the monthly review's re-prioritization suggestions
should be based on "trend/news signal," and names #49 (periodic doc/changelog scan) and #53
(job-market + community trend scanning) as the review's inputs. Neither exists yet — they're items
9 and 10 in this same wishlist queue, not yet reached.

**Option (a):** scope this item to the target-depth data model + priority-distance display + a
manual "trigger a review now" mechanism, using one cheap general-knowledge agent call (no
dedicated scan pipeline) to generate plausible suggestions for this pass — engineered so #49/#53's
future output can plug into the same review mechanism later without a redesign.

**Option (b):** recommend reordering — build #49 and/or #53 first as a prerequisite, defer this
item.

**Chosen: (a).** Reasoning, in order of how directly it's grounded in this repo's own text (not
inferred from precedent elsewhere in the queue):

1. `.planning/wishlist.md`'s own queue-ordering note says #53 is placed deliberately last in the
   active build queue because "no data source/API/credential has been chosen for job-market data,
   so this is likely to hit a genuine human-only blocker during planning — every item ahead of it
   should get built first." This is the queue's own author stating, in writing, that #53 is not
   safely plannable unattended right now. Recommending (b) — "build #53 first" — would mean
   recommending exactly the thing the queue's own ordering logic already ruled out for this run.
2. #49 carries the same "Needs real product/architecture planning first... this entry queues the
   idea, it does not spec it" disclaimer every unspecced wishlist item carries — it is not a
   finished, buildable prerequisite sitting ready to consume; it would need its own full planning
   pass first, at which point deferring #52 accomplishes nothing but delay.
3. Issue #52's own "Done when" clause is: "at least one domain has an assigned target expertise
   level distinct from its current knowledge percentage, and a monthly review surfaces at least
   one suggested re-prioritization for the user to accept or reject." Nothing in that sentence
   requires the suggestion's provenance to be real trend data — it requires a suggestion to exist
   and be actionable. A general-knowledge agent call satisfies this literally, not just as a
   workaround.
4. The target-depth + priority-distance half of this item has zero technical dependency on #49 or
   #53 — it is a self-contained data-model and display feature that stands as real, shippable
   value regardless of when the scan pipelines land. Deferring the whole item would delay real,
   independent value for a dependency that doesn't actually block it.

The advisor consulted mid-planning (before invoking `/plan-playwright`) independently converged on
(a) with the same reasoning, plus additional mandatory specificity requirements that are now
baked into `spec.md`'s numbered Decisions list (the nullable-no-default column, the
`DEPTH_TARGET_PERCENT` mapping, the "never call it gap" naming rule, the non-syncing with
`gap.ts`'s probing ceiling, the `source` discriminator seam, the wall-clock review-due exception,
the unsourced-labeling UI choice, and the `DepthSlider` enum-mismatch trap) — all incorporated
directly rather than re-litigated.

**This is not the same situation as item 4's "target already built, scoped down to the real gap"
pattern** that this run was pointed toward as a possible precedent. Item 4 found existing
infrastructure that already covered the described need. This item found the *opposite*: two named
inputs (#49, #53) that don't exist and are explicitly not ready to build unattended. The reasoning
that actually settles this fork is the wishlist's own stated ordering logic for #53 (point 1
above) and the literal reading of #52's Done-when (point 3), not an appeal to how a different item
in the same queue happened to resolve.

## Why the existing `DepthLevel` enum, not the issue's "expert"/"familiar" wording

The issue's mermaid diagram illustrates "expert" (AWS, Next.js, Postgres) vs. "familiar" (lower
priority) as *examples*, not a specified taxonomy — the issue's own "Note" section says explicitly
"this issue queues the idea, it does not spec it." The codebase already has a complete, working
three-tier depth vocabulary (`packages/shared/src/depth.ts`: `awareness`/`working`/`deep`, with
`DEPTH_RANK` for ordering and `DEPTH_INTENT` for user-facing descriptions of what each level
means) already governing `curricula.defaultDepth` and `topics.depth`. Inventing a second,
differently-shaped vocabulary for domain nodes specifically would fragment "depth" into two
incompatible meanings within the same app for no product benefit the issue actually asks for —
the issue's real requirement is "some domains need more depth than others, make that explicit and
settable," which the existing enum already expresses.

## Why "priority distance," never "gap"

`apps/api/src/db/schema.ts` already has a `gaps` table with a specific, principled meaning:
user-created "I don't know" markers, logged only via an explicit Fail tap or "I don't know"
statement (`.product/PRINCIPLES.md`'s "User-only gap creation" — "the system never auto-logs
gaps"). If this plan's target-depth-vs-percent distance were named or modeled as a "gap," it would
read as violating that principle on sight, even though it's a completely different, purely
derived, read-only display concept that never writes to the `gaps` table. Naming it "priority
distance" throughout — schema-adjacent naming isn't at stake since it's not stored at all, only
computed on read — removes the ambiguity entirely rather than requiring a reader to hold "this
gap isn't that gap" in their head.

## Why the review-trigger's failure path doesn't mirror placement's silent fallback

`domain-placement.orchestrator.ts`'s sibling-discovery agent call fails silently by design — it
runs as an invisible step inside curriculum creation, a flow the user is not specifically watching
for a placement outcome; blocking curriculum creation on an LLM call succeeding would be a much
worse user experience than an occasional un-placed curriculum. The review trigger in this plan is
structurally different: it is *only* invoked when the user explicitly clicks "trigger review" and
is actively waiting on a response. Silently returning nothing would present as a broken button,
not graceful degradation — the correct behavior here is a visible error the user can retry, which
is what SCENARIO 8 and the architecture doc's flowchart both encode.

## Why no separate "review run" table

A `domain_priority_reviews` table (one row per trigger, independent of its suggestions) was
considered and rejected in favor of deriving "last reviewed" / "review due" from
`MAX(domain_priority_suggestions.created_at)` for the subject. The only scenario where this falls
short is a review that returns zero suggestions — resolved by requiring the agent to always return
at least one row (a "no changes recommended" acknowledgment, itself suggestion-shaped with
`suggestedTargetDepth === currentTargetDepth`), which keeps every trigger leaving a timestamped
trace without adding a second table whose only job would be bookkeeping a timestamp already
derivable from data the feature stores anyway.

## Consistency gate — check-by-check log (run 2026-07-28, 0 gaps)

1. **Scenario → Acceptance.** All 9 scenarios (`scenarios.md`) carry a full Acceptance block with
   Code/Behavior/Integration/Observability/Tests, each layer explicit (Observability is explicitly
   `None` throughout — no new logging/metrics surface is introduced by this plan). PASS.
2. **Scenario → e2e box.** S3, S5, S6, S7, S9 each carry exactly one unchecked
   `[ ] @domain-priority-review.S<N> — e2e test written` line. S1, S2, S4, S8 are backend/vitest-
   only per the Phase 6.0 triage and carry vitest-file checkboxes instead, consistent with
   `playwright.md`'s "Not e2e" section explaining why. PASS.
3. **Scenario → state contract.** Every scenario has a row in `state-fixtures.md` with concrete
   entities, each tagged subject/scenery, a state source (`additive-seed` throughout — no
   scenario needed `local-accumulated`, `backup-restore`, or a read-only target), and a reseed
   strategy (`wipe-and-replay-baseline-plus-mocks` throughout, consistent with this project's
   local e2e Postgres being fully mutable and cheaply reseedable). PASS.
4. **Scenario → action map.** Every e2e scenario appears in `playwright.md`'s scenario→action map;
   every action gap (`setNodeTargetDepth`, `openPriorityReviewPage`, `triggerPriorityReview`,
   `resolveSuggestion`) is listed in the consolidated table with its used-by scenarios; no
   scenario composes an action absent from both the existing surface and the gap list. PASS.
5. **Diagram → scenario/architecture.** All 4 Mermaid diagrams in `architecture.md` map to real
   structural decisions this plan makes (data-shape placement, the review-trigger flow, the
   accept/reject state machine, the source-discriminator seam) — none decorative. PASS.
6. **Deriver (rare, e2e-first).** The two pure-logic Code items this plan introduces
   (`domainPriorityDistance`, `isDomainPriorityReviewDue`) are exactly SCENARIOS 1 and 2, both
   named, both with a real test file path. No deriver forced where an e2e scenario would be the
   more natural proof. PASS.
7. **Documentation.** `architecture.md` was written; `spec.md`'s Documentation changes section
   commits to publishing `docs/architecture/domain-priority-review.md` during implementation and
   explicitly confirms `docs/architecture/seed-knowledge-map.md` needs no edit (this plan adds
   capability alongside it, doesn't change anything that doc already describes). PASS.
8. **Constitution + framework safety.** Migrations are generated via `npm run db:generate:api`,
   never hand-written (spec.md, Implementation order #3) — matches the IE constitution's
   migrations-generated-never-pushed rule and this project's own established convention. No
   scenario seeds its own subject (every scenario's Acceptance/state-fixtures table marks the
   verified action as "subject," driven through the real UI, never seeded). No scenario is parked
   as a future `test.skip`. This project has no `mathaul-dev`-equivalent forbidden target — all
   e2e runs against the local, fully-mutable e2e Postgres. PASS.
9. **Open questions → carried.** The one open item (the 0-suggestion review needing an
   acknowledgment-row guarantee) is recorded identically in `scenarios.md` (SCENARIO 4),
   `playwright.md`, and `state-fixtures.md` — visible to `/write-playwright-tests` and
   `/implement-playwright` from all three files, not silently dropped. PASS.

**Result:** 9/9 PASS, 0 gaps. Per this run's unattended-planning authorization, `state: draft` was
promoted to `state: confirmed` in `spec.md`, `scenarios.md`, `architecture.md`, `playwright.md`,
and `state-fixtures.md` immediately upon the gate passing.
