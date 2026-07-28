---
type: plan-summary
branch: domain-priority-review
task: Per-domain expertise priority, with a monthly re-prioritization review (issue #52)
complexity: complex
state: confirmed
updated: 2026-07-28
---

# Plan summary — Per-domain expertise priority + monthly re-prioritization review

## What this ships

1. Every `domain_node` can carry a **target depth** (reusing the existing `awareness/working/deep`
   enum from `packages/shared/src/depth.ts` — not the issue's own "expert"/"familiar" wording,
   which has no home in the shipped vocabulary). Nullable, no default.
2. A **priority distance** — target depth mapped to a target percent, minus the node's real rollup
   percentage (`domainNodeProgress`, unchanged) — displayed next to the existing percent badge.
   `null` when no target is set (distinct from `0`, which means "on or above target").
3. A **manual** "trigger a review" action (button + endpoint) that calls one cheap Mastra agent to
   propose re-prioritization suggestions for a subject's domain tree. Suggestions are persisted
   with a `source` discriminator (`"general-knowledge"` today) and a `pending|accepted|rejected`
   status, so issue #49 (doc/changelog scan) and #53 (job-market/trend scan) can add their own
   `source` values into the exact same review/accept/reject mechanism later — no redesign.
4. A "review due" indicator derived from wall-clock time since the last triggered review
   (30-day threshold), since no cron/scheduler exists anywhere in this app.

## What this deliberately does NOT ship (see spec.md § Decisions made autonomously #1)

- Building #49 or #53's scan pipelines — only the seam (`source` column) they'll plug into.
- Real scheduling/automation — v1 is manual-trigger only.
- Wiring domain-node target depth into `gap.ts`'s probing-ceiling filter, `daily-push.ts`, or
  `replenish.ts` — those stay governed by `curricula.defaultDepth` only, unchanged.

## Scope-now-vs-defer judgment call (the load-bearing decision for this whole plan)

Issue #52 names #49 and #53 as the review's suggestion inputs, and neither is built. Two real
options existed: (a) scope this item to the target-depth model + manual-trigger review using a
cheap general-knowledge agent call, engineered so #49/#53 slot in later without a redesign, or
(b) defer this item and build #49/#53 first. **(a) was chosen.** Full reasoning in
`discussion.md` and `spec.md`'s Decisions section — short version: the wishlist's own text says
#53 is deliberately last because it will hit "a genuine human-only blocker" (no data source
chosen), and #49 is explicitly unspecced too, so recommending (b) means recommending a
prerequisite the queue itself already flagged as unplannable unattended. #52's own Done-when
doesn't require the suggestion's provenance to be real trend data — a general-knowledge call
satisfies it literally, and the target-depth/priority-distance half of this item stands on its
own as real value regardless of #49/#53's timeline.

## Files written

- `spec.md` — data model, mechanism, Definition of Done, decisions made autonomously.
- `scenarios.md` — 9 scenarios (S1–S9), backend + e2e.
- `architecture.md` — new agent + new orchestrator + new tables; published to
  `docs/architecture/domain-priority-review.md` at implementation time.
- `playwright.md`, `state-fixtures.md` — verification-repo mapping (`post-anki` project,
  `features/domain-map` — same feature folder as `seed-knowledge-map`, extended, not forked).
- `discussion.md` — full reasoning for every judgment call.

## Consistency gate

PASS — 0 gaps. See `discussion.md` for the check-by-check log. `state: draft` promoted to
`state: confirmed` in every plan file listed above, per this run's unattended-planning
authorization (no interactive review step exists for this run).
