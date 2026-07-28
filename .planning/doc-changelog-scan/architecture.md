---
type: architecture
branch: doc-changelog-scan
state: confirmed
updated: 2026-07-28
---

# Architecture — Periodic doc/changelog scan

## Why this plan gets an architecture.md

New Mastra agent (`docScan`), new orchestrator layer (`doc-scan.orchestrator.ts`) with its own
failure-propagation contract (deliberately the opposite of item 7's, for a documented reason), three
new tables, and — unlike item 7 — a genuinely new piece of deployed cloud infrastructure (a second
`gcp.cloudscheduler.Job`). Any one of these would qualify; all four together make this a clear
architecture-doc case.

## Where the new pieces sit relative to item 7's shape

```mermaid
flowchart TB
  domainNodes["domain_nodes<br/>(existing)<br/>+ superseded_at, superseded_reason (NEW, nullable)"]
  prioritySuggestions["domain_priority_suggestions<br/>(item 7, UNCHANGED)"]
  topicSuggestions["domain_topic_suggestions<br/>(NEW)<br/>propose a brand-new node"]
  supersessionSuggestions["domain_supersession_suggestions<br/>(NEW)<br/>flag an existing node"]
  watermark["tracked_tool_scan_state<br/>(NEW)<br/>per-tool last_content_hash"]
  fetcher["tracked-tool-fetcher.ts<br/>(NEW)<br/>uses outbound-fetch.ts"]
  outboundFetch["outbound-fetch.ts<br/>(NEW — extracted from<br/>doc-link-grounding.ts)"]
  scanOrchestrator["doc-scan.orchestrator.ts<br/>(NEW)"]
  reviewOrchestrator["domain-priority-review<br/>.orchestrator.ts (item 7, UNCHANGED)"]
  nameResolver["domain-node-name-resolver.ts<br/>(existing, shared)"]
  agent["docScan agent<br/>(NEW, cheap tier)"]
  scheduler["gcp.cloudscheduler.Job<br/>'doc-scan' (NEW)"]

  domainNodes --> scanOrchestrator
  topicSuggestions --> scanOrchestrator
  supersessionSuggestions --> scanOrchestrator
  watermark --> scanOrchestrator
  scanOrchestrator --> fetcher --> outboundFetch
  scanOrchestrator --> agent
  scanOrchestrator --> nameResolver
  reviewOrchestrator --> nameResolver
  scheduler -->|"weekly POST /doc-scans"| scanOrchestrator
```

`domainNodeProgress()` (item 5's percent rollup) and `domain_priority_suggestions` (item 7) are
untouched — this plan adds two new sibling suggestion tables and one new marker pair on
`domain_nodes`, not a modification to either existing mechanism.

## Scan flow — the load-bearing sequence

```mermaid
flowchart TB
  Trigger["Weekly Cloud Scheduler tick,<br/>OR manual 'Scan now' click"]
  ForEachTool["For each of 4 TRACKED_TOOLS:<br/>fetch + truncate + hash"]
  FetchFail["Fetch fails →<br/>skip tool this run,<br/>watermark untouched"]
  Compare["Compare hash to<br/>tracked_tool_scan_state"]
  AnyChanged{"Any tool<br/>changed?"}
  NoOp["Return early —<br/>ZERO agent calls,<br/>ZERO new rows"]
  BuildPrompt["Build ONE prompt:<br/>tree + only CHANGED tools' content"]
  CallAgent["Call docScan agent<br/>EXACTLY ONCE"]
  AgentOk{"Call<br/>succeeds?"}
  Resolve["Resolve each nodePath via<br/>domain-node-name-resolver.ts"]
  Insert["Insert resolved suggestions;<br/>advance watermark for<br/>included tools ONLY"]
  Fail["Log error, return empty<br/>result — watermark for<br/>changed tools UNCHANGED<br/>(retried next run)"]
  Http200["Controller always<br/>responds 200"]

  Trigger --> ForEachTool
  ForEachTool -->|"fails"| FetchFail --> Compare
  ForEachTool -->|"succeeds"| Compare
  Compare --> AnyChanged
  AnyChanged -->|"no"| NoOp --> Http200
  AnyChanged -->|"yes"| BuildPrompt --> CallAgent --> AgentOk
  AgentOk -->|"yes"| Resolve --> Insert --> Http200
  AgentOk -->|"no"| Fail --> Http200
```

**The deliberate divergence from `domain-priority-review.orchestrator.ts` (item 7).** Item 7's
trigger is foreground and user-waited-on, so an agent failure there throws visibly (502) — a silent
no-op would look like a bug. This scan's primary trigger is a scheduled background job nobody is
watching in real time; the manual "Scan now" button reuses the identical orchestrator rather than
getting its own contract. An agent failure here is caught, logged, and returns an empty/flagged
result — `200` always — matching `domain-placement.orchestrator.ts`'s existing silent-fallback
posture instead. See `spec.md` Decisions #8, and SCENARIO 10 for the proof that a failure doesn't
also corrupt the watermark (changed tools stay un-advanced, so they're retried, not silently
skipped).

## Accept/reject — two sibling state machines, not one shared table

```mermaid
stateDiagram-v2
  [*] --> pending: scan inserts a row (either table)
  pending --> accepted_topic: PATCH .../domain-topic-suggestions/:id<br/>{accepted} → inserts a real domain_node
  pending --> rejected_topic: PATCH → {rejected}<br/>no node created
  pending --> accepted_supersession: PATCH .../domain-supersession-suggestions/:id<br/>{accepted} → sets superseded_at/reason
  pending --> rejected_supersession: PATCH → {rejected}<br/>node untouched
  accepted_topic --> [*]
  rejected_topic --> [*]
  accepted_supersession --> [*]
  rejected_supersession --> [*]
```

Why two tables instead of reusing item 7's `domain_priority_suggestions` (the seam its own
architecture.md drew for this item): verified by reading the actual schema —
`domain_priority_suggestions.domain_node_id` is `NOT NULL` and its payload column is
`suggested_target_depth`. A new-topic proposal has no existing node id to reference yet; a
supersession flag isn't a target-depth change. Forcing both into that row would mean making
`domain_node_id` nullable and adding two more nullable payload columns beside
`suggested_target_depth` for the cases where it doesn't apply — messier and less honest than two
small, fully-NOT-NULL-where-possible tables that share the exact same
`pending|accepted|rejected` + `resolved_at` + `source` shape as a pattern, not as a literal shared
row.

## The "flag, not reduce" boundary

```mermaid
flowchart LR
  progress["domainNodeProgress()<br/>(packages/core — UNCHANGED)<br/>pure rollup from real<br/>topic-progress rows"]
  percent["percent<br/>(read-only, derived)"]
  supersede["superseded_at / superseded_reason<br/>(NEW, nullable — written ONLY<br/>on user PATCH accept)"]
  badge["'Possibly outdated' badge<br/>(renders beside percent,<br/>never replaces it)"]

  progress --> percent --> badge
  supersede --> badge
```

`percent` and the supersession flag are two independent signals rendered side by side — the scan
job itself never writes to either `domain_nodes.target_depth` (item 7's column) or anything that
feeds `domainNodeProgress()`. The only write path to `superseded_at`/`superseded_reason` is the
user's own PATCH accept, which is exactly what keeps this compliant with `.product/PRINCIPLES.md`'s
"no passive maturity decay" rule (see `spec.md` Decisions #2).

## What this plan does not change

- `packages/core/src/domain-map/domain-map-progress.ts` — `domainNodeProgress()` unchanged; no
  code path in this plan can set `percent`.
- `apps/api/src/domain-map/domain-priority-review.orchestrator.ts` and
  `domain_priority_suggestions` — zero changes, own table, own mechanism, untouched.
- `apps/bot/src/server.ts` — zero changes; no new Telegram push wired (Decisions #7).
- Every other Cloud Run service, domain mapping, or service account in `infra/index.ts` — additive
  only; the new `gcp.cloudscheduler.Job` targets the existing `apiService`, no new service.
