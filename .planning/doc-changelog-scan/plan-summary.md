---
type: plan-summary
branch: doc-changelog-scan
task: Periodic doc/changelog scan — surface new topics, flag superseded knowledge (issue #49)
complexity: complex
state: confirmed
updated: 2026-07-28
---

# Plan summary — Periodic doc/changelog scan

## What this ships

1. A hardcoded, real starter list of 4 tracked tools (Next.js, TypeScript, React Router, TC39
   proposals — all fetchable URLs verified reachable at planning time) with a per-tool persisted
   scan watermark (`tracked_tool_scan_state`: last content hash + last scanned time).
2. A scan orchestrator that fetches each tool's changelog/release feed, calls one cheap Mastra
   agent **only for tools whose content changed since last run**, and produces up to
   **5 suggestions total, combined and capped after resolution** (`MAX_TOTAL_SUGGESTIONS = 5`,
   mirroring item 7's own cap), across two kinds: propose a brand-new domain-map node, or flag an
   existing node as possibly superseded by newer material.
3. Two new sibling suggestion tables (`domain_topic_suggestions`, `domain_supersession_suggestions`)
   — NOT a reuse of item 7's `domain_priority_suggestions` table, because that table's row shape
   (`domain_node_id NOT NULL`, `suggested_target_depth`) cannot express either output this item
   needs. The **review-screen UX pattern** (pending list, accept/reject, `resolved_at`, `source`
   discriminator) is reused; the underlying table is not.
4. A **flag**, not an automatic percentage reduction: `.product/PRINCIPLES.md`'s "no passive
   maturity decay" rule and `domainNodeProgress()`'s pure-derived nature both rule out an automatic
   percent drop. Accepting a supersession suggestion writes a new `superseded_at`/
   `superseded_reason` marker on the node (shown as a badge beside the unchanged percent) — written
   only on user acceptance, never by the cron job itself.
5. Real scheduled infrastructure: a second `gcp.cloudscheduler.Job` in `infra/index.ts`, weekly,
   mirroring the existing `dailyPushJob` pattern — because issue #49's Done-when literally requires
   "gets scanned on a schedule," unlike item 7's Done-when. Also a manual "Scan now" button on the
   extended priority-review screen, hitting the identical orchestrator, for e2e-testability and
   immediate feedback.

## What this deliberately does NOT ship

- A real-time or per-commit scan — weekly cadence only, per the wishlist's explicit
  "daily or weekly, not per-change" constraint.
- A user-editable tracked-tools setting — `apps/api/src/admin-settings/` exists but is currently a
  single boolean; extending its schema to hold an array is named as a follow-up, not built here.
- A new Telegram digest message — suggestions surface on the review screen only; issue #11's
  original "weekly Telegram digest" ask is named as a natural, cheap follow-up once this mechanism
  exists.
- Any change to `domainNodeProgress()`, the `gaps` table, or `curricula.defaultDepth`-driven
  probing-ceiling logic (`gap.ts`, `daily-push.ts`, `replenish.ts`) — zero changes, same posture as
  item 7.

## The three real judgment calls (see `spec.md` § Decisions made autonomously for full reasoning)

1. **Mechanism reuse is partial, not full.** The review-screen UX pattern (pending/accept/reject)
   is reused; the `domain_priority_suggestions` table itself is not, because its row shape cannot
   hold either of this item's two outputs. Two new sibling tables instead.
2. **Scheduling is real, not manual-only** — unlike item 7, whose Done-when never said "schedule."
   `infra/index.ts` already has a working Cloud Scheduler pattern (`dailyPushJob`); this item adds a
   second job following it exactly, plus names the two concrete new deploy prerequisites it
   introduces (a new Pulumi secret, a longer `attemptDeadline`).
3. **"Reduce" becomes "flag."** A literal automatic percentage reduction would violate
   `.product/PRINCIPLES.md`'s explicit no-passive-decay rule and isn't even possible against a
   purely-derived `percent` value. Implemented as a user-accepted flag instead, documented plainly
   as a deliberate reinterpretation of the wishlist's "reduce/flag" wording.

## Files written

- `spec.md` — data model, mechanism, Definition of Done, decisions made autonomously.
- `scenarios.md` — 10 scenarios (S1–S10), backend/vitest + e2e.
- `architecture.md` — new agent, new orchestrator, new tables, new scheduled infra; published to
  `docs/architecture/doc-changelog-scan.md` at implementation time.
- `playwright.md`, `state-fixtures.md` — verification-repo mapping (`post-anki` project,
  `features/domain-map` — same feature folder as `seed-knowledge-map` and `domain-priority-review`,
  extended again, not forked).
- `discussion.md` — full reasoning for every judgment call.

## Consistency gate

PASS — 0 gaps (see `spec.md`'s own gate log at the bottom of this planning session). `state: draft`
promoted to `state: confirmed` in every plan file listed above, per this run's unattended-planning
authorization.
