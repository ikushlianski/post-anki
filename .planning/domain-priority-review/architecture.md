---
type: architecture
branch: domain-priority-review
state: confirmed
updated: 2026-07-28
---

# Architecture — Per-domain expertise priority + monthly re-prioritization review

## Why this plan gets an architecture.md

Per this project's own trigger list: a new agent added to the Mastra registry
(`domainPriorityReview`), a new orchestrator layer (`domain-priority-review.orchestrator.ts`) that
introduces its own foreground-error-propagation contract (deliberately different from the existing
placement orchestrator's silent-fallback contract), and a new table
(`domain_priority_suggestions`) with its own accept/reject state machine sitting beside
`domain_nodes` — a structural addition, not a column bolted onto an existing pipe.

## Where the new pieces sit relative to `seed-knowledge-map`'s existing shape

```mermaid
flowchart TB
  domainNodes["domain_nodes<br/>(existing — self-referential tree)<br/>+ target_depth (NEW, nullable)"]
  suggestions["domain_priority_suggestions<br/>(NEW table)<br/>source, status, reason"]
  progressDeriver["domainNodeProgress()<br/>(existing, UNCHANGED)"]
  distanceDeriver["domainPriorityDistance()<br/>(NEW, pure)"]
  dueDeriver["isDomainPriorityReviewDue()<br/>(NEW, pure)"]
  reviewOrchestrator["domain-priority-review<br/>.orchestrator.ts (NEW)"]
  placementOrchestrator["domain-placement<br/>.orchestrator.ts (existing)"]
  nameResolver["domain-node-name-resolver.ts<br/>(NEW — extracted, shared by both)"]
  agent["domainPriorityReview agent<br/>(NEW, cheap tier)"]

  domainNodes --> progressDeriver
  domainNodes --> distanceDeriver
  progressDeriver -->|"percent"| distanceDeriver
  suggestions --> dueDeriver
  reviewOrchestrator --> domainNodes
  reviewOrchestrator --> suggestions
  reviewOrchestrator --> agent
  reviewOrchestrator --> nameResolver
  placementOrchestrator --> nameResolver
```

`domainNodeProgress()` is called unchanged — the percentage rollup this plan displays alongside
priority distance is exactly item 5's existing contract, not touched or reinterpreted. The two new
pure derivers (`domainPriorityDistance`, `isDomainPriorityReviewDue`) are new, independent
functions, each testable without a database.

## Review-trigger flow — the load-bearing sequence for this plan

```mermaid
flowchart TB
  Start["User clicks 'trigger review'<br/>on a subject's priority-review screen"]
  LoadTree["Load subject's domain tree<br/>via getDomainMapForSubject()<br/>(existing, unchanged)"]
  BuildPrompt["Build ONE prompt:<br/>every node's name, path,<br/>current target depth or 'unset', percent"]
  CallAgent["Call domainPriorityReview agent<br/>EXACTLY ONCE — never per-node"]
  AgentOk{"Call<br/>succeeds?"}
  Resolve["Resolve each returned nodePath<br/>via domain-node-name-resolver.ts<br/>(shared with placement orchestrator)"]
  Dropped["Unresolvable path →<br/>dropped silently, not inserted"]
  Insert["Insert one domain_priority_suggestions<br/>row per resolved suggestion<br/>(source: 'general-knowledge', status: 'pending')"]
  Return["Return suggestions to caller"]
  Fail["Propagate the error —<br/>NEVER swallowed"]
  Http502["Controller returns 502<br/>with a clear message"]

  Start --> LoadTree --> BuildPrompt --> CallAgent --> AgentOk
  AgentOk -->|"yes"| Resolve
  Resolve -->|"path resolves"| Insert --> Return
  Resolve -->|"path doesn't resolve"| Dropped
  AgentOk -->|"no (network/timeout/schema)"| Fail --> Http502
```

**This is the deliberate divergence from `domain-placement.orchestrator.ts`.** Placement's agent
call fails silently (`domainNodeId: null`, curriculum creation proceeds) because it is an invisible
background step inside another action the user isn't watching. This review trigger is the opposite
— an explicit, foreground, user-initiated action the user is actively waiting on. A silent no-op
here would look like a bug ("I clicked the button and nothing happened"), not graceful
degradation. See `spec.md`'s Decisions #10 and SCENARIO 8.

## Accept/reject state machine

```mermaid
stateDiagram-v2
  [*] --> pending: review trigger inserts row
  pending --> accepted: PATCH status=accepted<br/>(also writes target_depth<br/>onto the domain_node)
  pending --> rejected: PATCH status=rejected<br/>(domain_node untouched)
  accepted --> [*]
  rejected --> [*]
```

Both terminal states are persisted rows, never deletions — `accepted` and `rejected` both set
`resolved_at`, distinguishing "handled" from "still pending" without losing the record of what the
agent suggested and what the user decided (`spec.md` Decisions #11).

## The seam for #49 and #53

```mermaid
flowchart LR
  general["'general-knowledge'<br/>(THIS plan — one cheap<br/>agent call, general reasoning)"]
  docscan["'doc-scan'<br/>(#49, future — periodic<br/>doc/changelog scan)"]
  jobmarket["'job-market'<br/>(#53, future — job market<br/>+ community trend scan)"]
  suggestions["domain_priority_suggestions.source<br/>(single discriminator column)"]
  review["Same review screen,<br/>same accept/reject mechanism,<br/>unchanged"]

  general --> suggestions
  docscan -.->|"future producer"| suggestions
  jobmarket -.->|"future producer"| suggestions
  suggestions --> review
```

This is why `source` is a discriminator column on `domain_priority_suggestions` rather than a
separate table per input, and why the accept/reject mechanism operates on the row shape, not on
which system produced it: when #49 or #53 land, they insert rows with a different `source` value
into this same table, and the existing review screen, accept/reject endpoints, and "review due"
derivation all keep working unmodified — the only visible change to the user is a new label on
some suggestions.

## What this plan does not change

- `packages/core/src/domain-map/domain-map-progress.ts` — `domainNodeProgress()` is called
  unchanged; the percentage rollup stays exactly item 5's contract.
- `domain-placement.orchestrator.ts`'s own behavior and its silent-fallback contract for curriculum
  creation — only its internal path-resolution helper is extracted into a shared file it now
  imports from; its test suite must keep passing unchanged as proof.
- `gap.ts`, `daily-push.ts`, `replenish.ts` — domain-node `target_depth` is not wired into
  probing-ceiling logic in this plan (see `spec.md` Decisions #5).
- No cron, scheduler, or cloud infrastructure changes — the review trigger is a plain HTTP
  endpoint, called manually.
