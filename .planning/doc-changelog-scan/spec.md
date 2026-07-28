---
type: spec
branch: doc-changelog-scan
task: Periodic doc/changelog scan — surface new topics, flag superseded knowledge (issue #49)
complexity: complex
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local docker postgres, localhost:5436, e2e/docker-compose.yml)
  playwrightPlan: .planning/doc-changelog-scan/playwright.md
  stateFixtures: .planning/doc-changelog-scan/state-fixtures.md
---

# Spec: Periodic doc/changelog scan

### What to do

Track a small, hardcoded list of real tools (Next.js, TypeScript, React Router, TC39 proposals).
Weekly (real Cloud Scheduler infra, mirroring the existing daily-push job) plus a manual "Scan now"
button, fetch each tool's changelog/release feed and compare it against a persisted per-tool
watermark. Only for tools whose content actually changed since the last run, call one cheap Mastra
agent that proposes up to a handful of suggestions of two kinds: a brand-new domain-map node, or an
existing node possibly superseded by newer material. Suggestions are reviewed on the same
priority-review screen item 7 built (extended with two new sections), accepted or rejected exactly
like item 7's suggestions — but persisted in their own tables, because their payload shape doesn't
fit item 7's `domain_priority_suggestions` row (see Decisions #1). Accepting a supersession
suggestion writes a **flag** (a new nullable marker), never an automatic percentage drop (Decisions
#2).

### Data model (decided)

**`domain_nodes` gains two nullable columns, no default** (alongside item 7's `target_depth`):

```
superseded_at      timestamp   -- when a supersession suggestion was accepted; null = not flagged
superseded_reason  text        -- the agent's reason, snapshotted at accept time; null when not flagged
```

Never written automatically by the scan job — only by `resolveDomainSupersessionSuggestion()` on
`{ status: "accepted" }`. `domainNodeProgress()` and `percent` are completely untouched; this is
purely an additional, independent marker rendered next to the existing percent badge.

**New table `tracked_tool_scan_state`** — one row per tracked tool, the "never a firehose"
watermark:

```
tracked_tool_scan_state
  tool_key           text primary key     -- matches a TRACKED_TOOLS entry's key, e.g. "nextjs"
  last_content_hash  text                 -- sha256 of the last successfully fetched+truncated
                                           -- content; null = never successfully scanned
  last_scanned_at    timestamp            -- null = never scanned
```

No `label`/`source_url` columns — those live in the hardcoded `TRACKED_TOOLS` code constant
(Decisions #6); this table only persists the mutable watermark keyed by the code-owned `tool_key`.

**New table `domain_topic_suggestions`** — "propose a brand-new node" (the (a) output issue #49
needs, which cannot reference an existing `domain_node_id`):

```
domain_topic_suggestions
  id                       text primary key
  subject_id               text not null
  proposed_parent_node_id  text                 -- nullable = attach at the subject root; resolved
                                                 -- to a real existing node id AT SUGGESTION-CREATE
                                                 -- TIME via domain-node-name-resolver.ts, never a
                                                 -- name re-resolved later
  proposed_node_name       text not null
  reason                   text not null
  source                   text not null default 'doc-scan'
  status                   text not null default 'pending'
  created_at               timestamp not null default now()
  resolved_at              timestamp            -- set on accept or reject
  created_domain_node_id   text                 -- nullable; set to the newly inserted domain_node's
                                                 -- id on accept, null while pending/rejected
```

**New table `domain_supersession_suggestions`** — "flag an existing node" (the (b) output, which is
not a target-depth change and so does not fit item 7's table):

```
domain_supersession_suggestions
  id              text primary key
  subject_id      text not null
  domain_node_id  text not null        -- the existing node being flagged
  reason          text not null
  source          text not null default 'doc-scan'
  status          text not null default 'pending'
  created_at      timestamp not null default now()
  resolved_at     timestamp
```

Both new suggestion tables mirror item 7's `pending|accepted|rejected` + `resolved_at` shape and
`source` discriminator exactly (same review-UX pattern, Decisions #1) — they are simply two
separate, fully-NOT-NULL-where-possible tables instead of one table with nullable swap-columns for
two incompatible payload shapes.

### Tracked tools (decided — Decisions #6)

Hardcoded in `apps/api/src/domain-map/tracked-tools.ts`, real URLs, verified reachable (HTTP 200)
at planning time:

```ts
export const TRACKED_TOOLS = [
  { toolKey: "nextjs", label: "Next.js", sourceUrl: "https://github.com/vercel/next.js/releases.atom" },
  { toolKey: "typescript", label: "TypeScript", sourceUrl: "https://github.com/microsoft/TypeScript/releases.atom" },
  { toolKey: "react-router", label: "React Router", sourceUrl: "https://github.com/remix-run/react-router/releases.atom" },
  { toolKey: "tc39-proposals", label: "TC39 Proposals", sourceUrl: "https://github.com/tc39/proposals" },
] as const;
```

React Router, not a standalone Remix repo — Remix's routing merged into React Router v7 (Nov 2024);
tracking a now-dormant separate Remix repo would silently track nothing. GitHub `releases.atom`
feeds are small, structured, and diff cleanly; TC39's proposals README has no release feed but is a
single stable page whose content changes exactly when a proposal's stage changes, which is the
signal that matters here.

### Fetch mechanism (decided — Decisions #4)

Extract `probe()` (fetch + `AbortController` timeout) and `truncate()` (control-char strip + char
cap) from `apps/api/src/curriculum/doc-link-grounding.ts` (currently module-private) into
`apps/api/src/shared/outbound-fetch.ts` as `fetchWithTimeout(url, timeoutMs)` and
`truncateText(text, maxChars)` — a pure refactor; `doc-link-grounding.ts`'s own behavior and test
coverage must be unchanged, proven by its existing tests continuing to pass. `doc-link-grounding.ts`
is refactored to import these instead of its private copies. The new
`apps/api/src/domain-map/tracked-tool-fetcher.ts` uses the same primitives with its own smaller cap
(`MAX_TOOL_CONTENT_CHARS = 4_000` per tool, vs. `doc-link-grounding.ts`'s 30,000 for llms.txt — a
release/changelog feed is much denser signal per character, and the cap must hold across up to 4
tools in one prompt) and its own hash step (`crypto.createHash("sha256")` over the truncated text).

Not `tech-research-grounding.ts`'s web-search pattern — tracked tools have known URLs; there's no
need for an LLM to guess one.

**E2E override (decided — closes a gap the initial draft of this plan left as an "open
question," which is not acceptable per this project's own planning rule that no scenario may be
planned in a way `/implement-playwright` would have to skip).** Unlike item 7 — whose review
trigger reads only from the database before reaching the mockable LLM call —
`tracked-tool-fetcher.ts` makes real outbound HTTPS calls to GitHub before the agent is ever
involved, and nothing today intercepts that call the way `mock-openrouter` intercepts the LLM call
via `OPENROUTER_BASE_URL`. `tracked-tool-fetcher.ts` therefore checks a new env var,
`E2E_MOCK_TRACKED_TOOL_CONTENT` (added to `apps/api/src/shared/env.ts`'s Zod schema, optional,
JSON-encoded `Record<toolKey, string>`), before calling `fetchWithTimeout` at all — when set, it
returns the fixed content for that `tool_key` directly, making zero outbound calls. Same shape and
rationale as `resolveAgentModel`'s existing `OPENROUTER_BASE_URL` override: a dedicated,
env-gated bypass for the one dependency the e2e stage cannot let reach the real internet. Set only
in the verification-repo's e2e stage env, never in dev/prod.

### Scan mechanism (decided)

**Core orchestrator**, `apps/api/src/domain-map/doc-scan.orchestrator.ts`,
`runDocScan(subjectId: string): Promise<DocScanResult>`:

1. For each `TRACKED_TOOLS` entry: `fetchWithTimeout(sourceUrl, 8_000)`. A fetch failure (timeout,
   non-2xx, network error) skips that tool for this run — its watermark is left untouched so it's
   retried next run — and is logged (`log.warn`), never thrown.
2. For each successfully fetched tool: `truncateText(...)`, then hash. Compare against
   `tracked_tool_scan_state.last_content_hash` for that `tool_key`. Unchanged (or never seen before
   with an identical hash — not applicable on first run, everything is "changed" then) → excluded
   from this run's agent call. Changed → included.
3. **Zero tools changed → return immediately**: `{ newTopicSuggestions: [], supersessionSuggestions:
   [], toolsScanned: [...], toolsChanged: [], agentCalled: false }`. **Zero agent calls, zero new
   rows.** This is the concrete "never a firehose" proof (SCENARIO 3).
4. **≥1 tool changed** → load the subject's domain tree via the existing, unmodified
   `getDomainMapForSubject()` (same read-path reuse as item 7). Build ONE prompt: the whole tree
   (name, path, percent — same shape as item 7's prompt) plus each **changed** tool's label and
   truncated content. Call the new `docScan` agent **exactly once** (never per-tool, never
   per-node — same cost discipline as item 7's Decisions #8).
5. Agent returns (Zod-validated): `{ newTopicSuggestions: [{ parentNodePath: string[], nodeName:
   string, reason: string }] (max 3), supersessionSuggestions: [{ nodePath: string[], reason: string
   }] (max 3) }` — schema-level caps bound the raw agent output to at most 6 combined.
5b. After resolution (step 6), the combined resolved list is sliced to a hard cap of
   **`MAX_TOTAL_SUGGESTIONS = 5`** (new-topic suggestions taken first, then supersession, matching
   item 7's own `MAX_SUGGESTIONS = 5` post-resolution cap) before any insert — this is the single
   enforced "never more than 5 new rows per scan run" number, not the schema's raw 6.
6. Resolve each `parentNodePath`/`nodePath` via the existing shared
   `domain-node-name-resolver.ts` (`resolveNodePathByName`) — for new-topic suggestions, only the
   parent needs to resolve (same "first element is a generic root marker" contract
   `sibling-discovery.agent.ts` already uses); for supersession suggestions, the full path must
   resolve to a real existing node or the suggestion is dropped silently (same "don't hallucinate a
   node" posture as item 7 and the placement orchestrator).
7. Insert resolved suggestions: `domain_topic_suggestions` rows (`source: "doc-scan"`, `status:
   "pending"`, `proposed_parent_node_id` = the resolved id or null) and
   `domain_supersession_suggestions` rows (same `source`/`status`, `domain_node_id` = the resolved
   existing node).
8. Update `tracked_tool_scan_state` (hash + `last_scanned_at`) **only for the tools included in
   step 4** — and only if step 5's agent call succeeded. If the agent call throws (network, timeout,
   schema-invalid), the changed tools' watermarks stay at their OLD hash, so they are retried on the
   next run instead of being silently marked "scanned" despite producing nothing (SCENARIO 10 proves
   this). Tools whose content was unchanged in step 2 need no watermark update (already correct).
9. Return the result.

**Failure handling — the opposite posture from item 7's review trigger, for the opposite reason
(Decisions #8).** Item 7's trigger is a foreground, user-waited-on HTTP call, so it throws visibly
(502). This item's primary trigger is a **scheduled, unwatched background job** — nobody is looking
at Cloud Scheduler's response body. `runDocScan()` catches any agent-call failure internally
(matching `domain-placement.orchestrator.ts`'s silent-fallback posture, not item 7's), logs it via
`log.error`, and returns `{ ...emptyResult, agentCalled: false, agentError: true }` rather than
throwing. The controller always responds `200` for both the scheduled and manual trigger paths — a
`502` here would be a Cloud Scheduler retry-storm risk for a background job nobody is watching, and
this project has no alerting infra to make a `502` meaningful anyway.

**Cron wrapper**, same file, `runDocScanForAllTrackedSubjects(): Promise<Record<string,
DocScanResult>>` — lists every `subjectId` with at least one `domain_nodes` row (new repo query
`listSubjectIdsWithDomainNodes()`, same subject-gating precedent item 7 already established; in v1
that's exactly "Programming / Web Development") and calls `runDocScan()` once per subject. The
per-tool fetch+hash work is NOT deduplicated across subjects in v1 (re-fetches per subject) — deferred
optimization, not correctness-relevant at today's "exactly one gated subject" scale; noted as a
follow-up if a second gated subject is ever seeded.

### Endpoints (decided)

- `POST /subjects/:id/doc-scans` — manual trigger + e2e trigger. Calls `runDocScan(id)`. Requires
  the subject to already have `domain_nodes` rows (404 otherwise — same gating precedent as item
  7's review trigger). Returns the `DocScanResult`. Always `200`.
- `POST /doc-scans` — the scheduled job's target (no subject in the path, since Pulumi should not
  need to know a dynamically-generated subject id at deploy time). Calls
  `runDocScanForAllTrackedSubjects()`. Always `200`.
- `GET /subjects/:id/doc-scan-suggestions?status=pending` — returns `{ newTopics:
  DomainTopicSuggestion[], supersessions: DomainSupersessionSuggestion[] }`.
- `PATCH /domain-topic-suggestions/:id` — body `{ status: "accepted" | "rejected" }`. On
  `accepted`: inserts a new `domain_nodes` row via the existing `insertDomainNode()` under
  `proposed_parent_node_id` (already a resolved real id, no re-resolution needed), sets
  `created_domain_node_id` and `resolved_at`. On `rejected`: sets `resolved_at` only, no node
  created — the row stays visible as "handled," never deleted (same posture as item 7's Decisions
  #11).
- `PATCH /domain-supersession-suggestions/:id` — body `{ status: "accepted" | "rejected" }`. On
  `accepted`: writes `domain_nodes.superseded_at = now()`, `superseded_reason = <the suggestion's
  reason>`, sets `resolved_at`. On `rejected`: sets `resolved_at` only, node untouched.

All four new mutating routes reuse the codebase's existing generic-PATCH / RESTful-noun convention
(`curricula`'s `domainNodeId`/`speed` PATCH, item 7's `/domain-nodes/:id` and
`/domain-priority-suggestions/:id`).

### Scheduling (decided — Decisions #3)

`infra/index.ts` gains a second `gcp.cloudscheduler.Job`, `"doc-scan"`, mirroring `dailyPushJob`'s
exact shape:

```ts
const docScanSchedule = config.get("docScanSchedule") ?? "0 9 * * 1"; // Monday 09:00
const docScanTimeZone = config.get("docScanTimeZone") ?? "Europe/Warsaw";
const apiSharedSecret = config.getSecret("apiSharedSecret"); // NEW pulumi secret — see below

const docScanJob = new gcp.cloudscheduler.Job("doc-scan", {
  project: projectId,
  region,
  name: "post-anki-doc-scan",
  schedule: docScanSchedule,
  timeZone: docScanTimeZone,
  attemptDeadline: "300s",
  httpTarget: {
    httpMethod: "POST",
    uri: pulumi.interpolate`https://${apiDomain}/doc-scans`,
    headers: apiSharedSecret
      ? { Authorization: pulumi.interpolate`Bearer ${apiSharedSecret}` }
      : undefined,
  },
}, { dependsOn: [apiService, ...enabledApis] });
```

**Two concrete new deploy prerequisites this introduces (Infrastructure DoD, not automated-test
provable):**

1. **A new Pulumi secret**, `apiSharedSecret`, currently absent from Pulumi config — the API's
   `API_SHARED_SECRET` env var is today set only by CI (`.github/workflows/deploy.yml`'s
   `PROD_API_SHARED_SECRET` GitHub secret via `gcloud run deploy --set-env-vars`), and Pulumi has no
   visibility into that value. One-time human step: `pulumi config set --secret apiSharedSecret
   <same value as PROD_API_SHARED_SECRET>` — identical pattern to the already-existing
   `telegramWebhookSecret`/`electricDatabaseUrl` manual-secret prerequisites documented in
   `infra/index.ts`'s own comments.
2. **`attemptDeadline: "300s"`**, not `dailyPushJob`'s `"60s"`. Worst case: 4 tools × 8s fetch
   timeout (32s) + one LLM call (typically well under 60s for a cheap-tier model with a few
   thousand input tokens) — 300s gives real margin without redesigning the endpoint as
   async-ack-then-process.

Weekly, not daily — issue #49 offers "daily or weekly"; issue #11's own original framing was
explicitly "a **weekly** Telegram digest" and a doc/changelog source changes far less often than a
daily probe/push cadence, so weekly is the better fit for "must not overwhelm."

### Decisions made autonomously (no human present — see `discussion.md` for full reasoning)

1. **Mechanism reuse is partial, not full.** Verified by reading `domain_priority_suggestions`'s
   actual schema: `domain_node_id` is `NOT NULL` and the payload is `suggested_target_depth`. This
   item's two outputs — (a) propose a brand-new node (no node id exists yet) and (b) flag an
   existing node's knowledge as possibly superseded (not a target-depth change) — neither fits that
   row. Reused the **review-screen UX pattern** (pending list, accept/reject, `resolved_at`,
   `source` discriminator, same screen) via two new sibling tables instead of forcing two
   incompatible payload shapes into one NOT-NULL-constrained table via nullable swap-columns.
2. **"Reduce" becomes "flag," never an automatic percentage drop.**
   `.product/PRINCIPLES.md`: "Concept maturity only changes on interaction — it never degrades over
   time automatically... After 90 days without interaction, concepts get an 'Unverified' visual
   tag — not a penalty." A scheduled job automatically lowering `percent` would be exactly the
   forbidden passive decay — and `domainNodeProgress()` is also a pure derived rollup from real
   topic-progress rows, so nothing in the write path can set `percent` directly regardless of
   principle. The wishlist's own wording offers "reduce**/flag**" — implemented the flag: a new
   nullable `superseded_at`/`superseded_reason` marker, written only when the **user accepts** a
   supersession suggestion (an interaction, not automatic decay), rendered as a badge beside the
   unchanged percent. Stated plainly here as a deliberate reinterpretation of "percentage visibly
   drops," not a silent one — SCENARIO 8 explicitly asserts `percent` is unchanged after accept as
   the negative-assertion proof.
3. **Real scheduled infrastructure, not manual-only** — the opposite scoping call from item 7, for
   a real reason, not inconsistency. Item 7's Done-when never used the word "schedule" and correctly
   stayed manual-trigger-only. Issue #49's Done-when literally requires "gets scanned **on a
   schedule**" — a manual button alone would not satisfy it. `infra/index.ts` already runs a live
   `gcp.cloudscheduler.Job` (`dailyPushJob`); this item adds a second one following that exact,
   already-proven pattern, rather than either (a) staying manual-only (fails the literal Done-when)
   or (b) inventing a new scheduling mechanism (there already is one). Named the two concrete new
   deploy prerequisites this creates (new Pulumi secret, longer `attemptDeadline`) explicitly in the
   Infrastructure DoD below, since neither is provable by an automated test.
4. **Fetch mechanism reuses `doc-link-grounding.ts`'s `probe()`/`truncate()` primitives, extracted**
   — not `tech-research-grounding.ts`'s web-search pattern. Tracked tools have known URLs; there is
   no need for an LLM to guess one, and a direct fetch is cheaper and more deterministic than a
   search-tool round-trip. The extraction is a pure refactor (same posture as item 7's
   `domain-node-name-resolver.ts` extraction) — `doc-link-grounding.ts`'s own behavior and tests must
   be unchanged.
5. **A persisted per-tool watermark (`tracked_tool_scan_state`), not item 7's "no run table"
   default.** Item 7 deliberately had no separate review-run table because its trigger was
   manual/one-shot — deriving "last reviewed" from `MAX(created_at)` was sufficient. A **recurring**
   scheduled scan is a genuinely different situation: without a persisted watermark, the same
   release would re-surface every week forever, which is precisely the firehose the wishlist
   forbids. This table doubles as both the cost-control mechanism (skip the agent call entirely for
   unchanged tools) and the concrete DoD proof (SCENARIO 3: second run against unchanged content →
   zero agent calls, zero new rows).
6. **Tracked tools are a hardcoded starter constant (4 tools), not a user-editable setting in v1.**
   Matches issue #11's own "3–5 tools" anti-noise rule. `apps/api/src/admin-settings/` is real
   (`appSettings`, single row, currently one `testToggle` boolean,
   `packages/shared/src/admin-settings.ts`) but its current shape cannot hold an array without its
   own schema change — extending it is named as a natural follow-up, not built here, to avoid
   growing this item's scope into a second feature (admin settings) that issue #49 doesn't require.
   Chose React Router over a standalone Remix repo (Remix's routing merged into React Router v7 in
   Nov 2024 — a still-existing but now largely dormant separate Remix repo would silently track
   nothing meaningful going forward) and GitHub `releases.atom` feeds over scraping changelog HTML
   pages (small, structured, diff cleanly) — except for TC39 proposals, which has no release feed
   and is tracked via its single stable proposals-list page instead, since a stage change on that
   page is exactly the signal that matters.
7. **No new Telegram notification channel in v1.** The bot's existing `POST /push`
   (`apps/bot/src/server.ts`) is the one existing notification channel; extending it to also mention
   doc-scan suggestions would add a second cross-service integration (bot → api) beyond this item's
   core mechanism. Chosen default: suggestions surface passively on the extended priority-review
   screen; zero notifications trivially satisfies "no more than a small bounded number of
   notifications per cycle." Issue #11's original "weekly Telegram digest" is named as the natural,
   cheap follow-up once this mechanism (and its suggestion volume, in practice) exists to digest.
8. **Agent-failure posture is the opposite of item 7's `domain-priority-review`, for the opposite
   reason.** Item 7's trigger is foreground/user-waited-on, so it throws visibly (502) — a silent
   no-op there would look like a bug. This item's primary trigger is a **scheduled, unwatched
   background job**; nobody is looking at Cloud Scheduler's response. Chose
   `domain-placement.orchestrator.ts`'s silent-fallback posture instead: catch, log, return an
   empty/flagged result, respond `200`. The manual "Scan now" button (added for e2e-testability, not
   as the primary trigger) hits the identical orchestrator and gets the identical graceful-failure
   behavior — no special-casing between the scheduled caller and the manual one.
9. **Watermark is only advanced on a successful agent call for the tools included in it** — a
   changed tool whose agent call then fails keeps its OLD hash, so it is retried next run rather than
   silently marked "scanned" despite producing nothing. This is the concrete anti-data-loss property
   SCENARIO 10 proves; without it, a single transient LLM failure would permanently skip surfacing
   whatever that week's changed content contained.
10. **Two new sibling suggestion tables share item 7's exact status/timestamp shape
    (`pending|accepted|rejected` + `resolved_at`, never deleted)** rather than each inventing its
    own — same "no data destructively deleted on a review-style flow" precedent item 7 cited
    (`structure_research_candidates.approval_status`).
11. **`proposed_parent_node_id` is resolved and stored as a real id at suggestion-creation time**,
    not re-resolved by name at accept time — the agent's returned `parentNodePath` is names, which
    could drift if nodes are renamed between scan and accept; storing the already-resolved id
    avoids a second, potentially-different resolution and matches how item 7 snapshots
    `current_target_depth` at suggestion-creation time rather than reading it live at accept time.
12. **Consistency-gate auto-confirmation.** All 9 gate checks passed with 0 gaps (log below); per
    this run's unattended-planning authorization, `state: draft` was flipped to `state: confirmed`
    in every plan file immediately once the gate passed, with no interactive review step in
    between — same precedent as item 7's Decisions #14.

### Files to touch

```
apps/api/src/
  shared/
    outbound-fetch.ts            — NEW: fetchWithTimeout(), truncateText() (extracted, generalized)
    env.ts                       — gains E2E_MOCK_TRACKED_TOOL_CONTENT (optional, JSON string)
  curriculum/
    doc-link-grounding.ts        — refactored to import from outbound-fetch.ts; own tests unchanged
  db/
    schema.ts                    — domainNodes gains supersededAt/supersededReason; NEW tables
                                    trackedToolScanState, domainTopicSuggestions,
                                    domainSupersessionSuggestions
    migrations/0025_*.sql        — NEW, generated via `npm run db:generate:api`
  domain-map/
    tracked-tools.ts              — NEW: TRACKED_TOOLS constant
    tracked-tool-fetcher.ts       — NEW: per-tool fetch + hash, using outbound-fetch.ts
    tracked-tool-fetcher.test.ts  — NEW
    doc-scan.orchestrator.ts      — NEW: runDocScan(), runDocScanForAllTrackedSubjects()
    doc-scan.orchestrator.test.ts — NEW (mocked fetch + mocked agent — SCENARIOS 2, 3, 4, 10)
    domain-map.repo.ts            — NEW: insertDomainTopicSuggestion, listDomainTopicSuggestions,
                                    resolveDomainTopicSuggestion, insertDomainSupersessionSuggestion,
                                    listDomainSupersessionSuggestions,
                                    resolveDomainSupersessionSuggestion, getTrackedToolScanState,
                                    upsertTrackedToolScanState, listSubjectIdsWithDomainNodes;
                                    EXISTING toDomainNode() and buildItem() (in
                                    getDomainMapForSubject) both gain projection of the new
                                    supersededAt/supersededReason columns — required for S8's
                                    GET /subjects/:id/domain-map assertion to have anything to read
    domain-map.repo.test.ts       — updated
    domain-map.controller.ts      — NEW: handleTriggerDocScan, handleTriggerAllDocScans,
                                    handleListDocScanSuggestions,
                                    handleResolveDomainTopicSuggestion,
                                    handleResolveDomainSupersessionSuggestion
  mastra/
    doc-scan.agent.ts             — NEW: createDocScanAgent()
    mastra.ts                     — AGENT_KEYS gains `docScan`, getMastra() registers it alongside
                                    the existing 18 entries (none edited)
  router.ts                       — POST /subjects/:id/doc-scans, POST /doc-scans, GET
                                    /subjects/:id/doc-scan-suggestions, PATCH
                                    /domain-topic-suggestions/:id, PATCH
                                    /domain-supersession-suggestions/:id
  server.ts                       — switch cases for the 5 new route names

packages/shared/src/
  domain-map.ts                   — domainNodeSchema/domainNodeTreeItemSchema gain
                                    supersededAt: z.string().nullable(), supersededReason:
                                    z.string().nullable(); NEW: domainTopicSuggestionSchema,
                                    domainSupersessionSuggestionSchema, docScanResultSchema,
                                    docScanAgentResultSchema, updateDomainTopicSuggestionInput,
                                    updateDomainSupersessionSuggestionInput

infra/index.ts                    — NEW: docScanSchedule/docScanTimeZone config, apiSharedSecret
                                    Pulumi secret, docScanJob (gcp.cloudscheduler.Job)

apps/web/src/
  domain-map/
    domain-map.api.ts             — new client fns: triggerDocScan, listDocScanSuggestions,
                                    resolveDomainTopicSuggestion, resolveDomainSupersessionSuggestion
    domain-map-tree.tsx           — each node gains a superseded badge (null-safe: renders nothing
                                    when supersededAt is null) beside the existing percent badge
    priority-review-panel.tsx     — gains "Scan now" button + two new sections: "New topics found"
                                    and "Possibly outdated" (accept/reject per row, mirroring the
                                    existing target-depth-suggestion section's interaction pattern)
  routes/
    subject.$subjectId.priority-review.tsx — EXISTING route (item 7), loader extended to also
                                    fetch GET /subjects/:id/doc-scan-suggestions?status=pending
                                    alongside its existing loader data — required for S5's
                                    Integration acceptance ("matches ... on a fresh page load")

verification-repo/projects/post-anki/post-anki/
  features/domain-map/ (extended, not forked)
  mock-openrouter/responses.ts    — new `doc-scan` responder
```

### Files NOT touched (confirm explicitly)

- `packages/core/src/domain-map/domain-map-progress.ts` — zero changes; `domainNodeProgress()`
  stays the single source of truth for percentage rollup, called unchanged. `percent` is never set
  by anything this item adds.
- `apps/api/src/domain-map/domain-priority-review.orchestrator.ts`,
  `domain_priority_suggestions` table/schema — zero changes; this item's suggestions live in their
  own tables (Decisions #1).
- `apps/api/src/curriculum/gap.ts`, `daily-push.ts`, `apps/api/src/probe-session/replenish.ts` —
  zero changes, same as item 7.
- `apps/api/src/admin-settings/` — zero changes; a user-editable tracked-tools list is a named
  follow-up, not built here (Decisions #6).
- `apps/bot/src/server.ts` — zero changes; no new Telegram digest message in v1 (Decisions #7).
- `apps/web/src/curriculum/depth-slider.tsx` — zero changes; unrelated to this item.

### Documentation changes

`architecture.md` is written (new agent, new orchestrator, new tables, new scheduled cloud
infrastructure — meets this project's own trigger list for a mandatory architecture doc twice
over). `docs/architecture/domain-priority-review.md` (published by item 7) is NOT modified — it
stays accurate as the record of item 7's own mechanism. A new
`docs/architecture/doc-changelog-scan.md` is published during implementation with a Mermaid diagram
of the scan/watermark/suggestion flow.

### Scope boundary

Out of scope for this plan:
- A user-editable "tracked tools" setting (Decisions #6) — hardcoded 4-tool starter list only.
- A new Telegram digest message (Decisions #7) — issue #11's original ask, named as a follow-up.
- Deduplicating the per-tool fetch across multiple gated subjects — only one subject is gated
  today; the cron wrapper re-fetches per subject, noted as a follow-up if a second gated subject
  is ever seeded.
- Any change to `domainNodeProgress()`'s percent rollup, `gaps` table, or
  `curricula.defaultDepth`-driven probing-ceiling logic.
- Re-parenting, splitting, merging, or deleting `domain_nodes` (issue #56, same as item 7 noted).
- A "vision check" / visual regression pass on the two new review-screen sections — structural
  assertions (testids, text content) are sufficient, same call item 7 made for its own screen.

### Implementation order

1. `apps/api/src/shared/outbound-fetch.ts` (extraction) + refactor `doc-link-grounding.ts` to use
   it; confirm its existing tests still pass unchanged.
2. `packages/shared/src/domain-map.ts` schema additions.
3. `apps/api/src/db/schema.ts` — `domain_nodes.superseded_at`/`superseded_reason`,
   `tracked_tool_scan_state`, `domain_topic_suggestions`, `domain_supersession_suggestions`;
   `npm run db:generate:api` then `npm run db:migrate:api` against local dev.
4. `apps/api/src/domain-map/tracked-tools.ts` + `tracked-tool-fetcher.ts` + test (SCENARIO 1 —
   pure hash/change-detection logic, no DB).
5. `apps/api/src/domain-map/domain-map.repo.ts` additions + tests (new tables' CRUD).
6. `apps/api/src/mastra/doc-scan.agent.ts` + `mastra.ts` additive registration.
7. `apps/api/src/domain-map/doc-scan.orchestrator.ts` + tests (SCENARIOS 2, 3, 4, 10 — mocked
   fetch + mocked agent).
8. `apps/api/src/domain-map/domain-map.controller.ts` additions + `router.ts` + `server.ts`.
9. `infra/index.ts` — `docScanJob` + config + secret (deploy-time only; the human prerequisite in
   Decisions #3 is documented, not automated).
10. `apps/web/src/domain-map/domain-map.api.ts`, `domain-map-tree.tsx` badge,
    `priority-review-panel.tsx` new sections, and the `priority-review` route loader extension
    (Files to touch — `routes/subject.$subjectId.priority-review.tsx`).
11. `verification-repo/.../mock-openrouter/responses.ts` — new `doc-scan` responder.
12. `verification-repo/.../features/domain-map/` — new actions + seeds (see `playwright.md`).
13. Publish `docs/architecture/doc-changelog-scan.md`.
14. `/write-playwright-tests` authors SCENARIOS 5–9's red e2e tests (SCENARIOS 1, 2, 3, 4, 10 are
    vitest-only — no e2e box).

### Definition of Done — per layer

**Backend**
- `npm run db:generate:api && npm run db:migrate:api` completes with no errors against a clean
  local schema and produces migration `0025_*` adding `domain_nodes.superseded_at`/
  `superseded_reason` (both nullable, no default), plus the three new tables
  (`tracked_tool_scan_state`; `domain_topic_suggestions`; `domain_supersession_suggestions`, each
  with `source` default `'doc-scan'`, `status` default `'pending'`).
- **SCENARIO 1 proof:** `npx vitest run apps/api/src/domain-map/tracked-tool-fetcher.test.ts` —
  hashing the same truncated content twice yields identical hashes; a one-character difference in
  input yields a different hash; a fetch failure (mocked rejected fetch) returns `null` (not a
  thrown error) and is distinguishable from "fetched, unchanged."
- **SCENARIO 2 proof:** `npx vitest run apps/api/src/domain-map/doc-scan.orchestrator.test.ts` —
  first-ever scan (no existing `tracked_tool_scan_state` rows, all 4 tools' mocked content is
  "new") results in exactly one mocked agent call receiving all 4 tools' content, and a
  `tracked_tool_scan_state` row is inserted for each of the 4 tools with a non-null
  `last_content_hash` — proven by a real `SELECT`.
- **SCENARIO 3 proof (the "never a firehose" proof):** same test file — running `runDocScan()` a
  second time with mocked fetches returning byte-identical content to the first run results in
  **zero** agent calls (call-count assertion, not just "no new suggestions") and **zero** new rows
  in `domain_topic_suggestions` or `domain_supersession_suggestions`, proven by real `SELECT`s
  showing unchanged row counts before/after the second run.
- **SCENARIO 4 proof:** same test file — a scan where only 1 of 4 tools' mocked content changed
  results in exactly one agent call whose prompt contains only that one tool's content (asserted
  via inspecting the mock's captured call arguments), not all 4.
- **SCENARIO 10 proof (anti-data-loss):** same test file — a scan with 2 changed tools whose
  mocked agent call rejects (simulated network error) results in `runDocScan()` returning
  normally (not throwing) with `agentCalled: false`/an error flag, **zero** new suggestion rows,
  and a real `SELECT` on `tracked_tool_scan_state` showing those 2 tools' `last_content_hash`
  UNCHANGED from before the failed call (still the old hash, proving they'll be retried, not
  silently marked scanned).
- `POST /subjects/:id/doc-scans` on a gated subject with 2 changed tools and a mocked 1-new-topic +
  1-supersession agent response results in exactly 1 `domain_topic_suggestions` row and exactly 1
  `domain_supersession_suggestions` row, both `source: "doc-scan"`, `status: "pending"` — proven by
  real `SELECT`s.
- **Cap proof:** a mocked agent response returning the schema max (3 new-topic + 3 supersession = 6
  raw suggestions, all resolving to real nodes) results in exactly **5** total rows inserted across
  both tables combined (`MAX_TOTAL_SUGGESTIONS`), not 6 — proven by a real `SELECT` count summed
  across both tables after the call.
- `E2E_MOCK_TRACKED_TOOL_CONTENT` set → `tracked-tool-fetcher.ts` returns the fixed content per
  `tool_key` and makes **zero** real outbound HTTP calls (mocked-fetch-not-called assertion) —
  proven in `tracked-tool-fetcher.test.ts`.
- `PATCH /domain-topic-suggestions/:id` with `{ status: "accepted" }` inserts a new `domain_nodes`
  row under the suggestion's `proposed_parent_node_id`, sets `created_domain_node_id` and
  `resolved_at` on the suggestion; with `{ status: "rejected" }` sets only `resolved_at`, no new
  node — both proven by real `SELECT`s.
- `PATCH /domain-supersession-suggestions/:id` with `{ status: "accepted" }` sets
  `domain_nodes.superseded_at`/`superseded_reason` AND leaves `domainNodeProgress()`'s `percent`
  for that node byte-identical to its value before the PATCH (negative assertion — proves
  Decisions #2's "flag, never reduce percent"); with `{ status: "rejected" }` leaves
  `superseded_at` null.
- `doc-link-grounding.test.ts` (or its integration coverage) passes unchanged, proving the
  `outbound-fetch.ts` extraction is a pure refactor (Decisions #4).
- `npx tsc --noEmit` clean across `apps/api`, `packages/core`, `packages/shared`.

**Frontend**
- Navigating to `/subject/:subjectId/priority-review` and clicking "Scan now" shows a loading
  state, then — with a mocked doc-scan agent response — the "New topics found" and "Possibly
  outdated" sections populate with the returned suggestions, each showing its reason and a
  "doc-scan" source label — proven by `@doc-changelog-scan.S5`.
- Clicking "accept" on a new-topic suggestion creates the node and navigating to
  `/subject/:subjectId/map` shows it under the correct parent — proven by
  `@doc-changelog-scan.S6`.
- Clicking "reject" on a new-topic suggestion leaves no new node on the map, and the suggestion no
  longer appears under "pending" — proven by `@doc-changelog-scan.S7`.
- Clicking "accept" on a supersession suggestion shows a "possibly outdated" badge next to the
  flagged node's existing (unchanged) percent badge on the domain map — proven by
  `@doc-changelog-scan.S8`.
- Clicking "reject" on a supersession suggestion leaves the flagged node with no badge — proven by
  `@doc-changelog-scan.S9`.
- `npx tsc --noEmit` clean across `apps/web`.

**Infrastructure (NOT "N/A" — unlike item 7)**
- `infra/index.ts` defines a new `gcp.cloudscheduler.Job` named `post-anki-doc-scan`, weekly
  (`0 9 * * 1` default, `Europe/Warsaw`), `attemptDeadline: "300s"`, targeting `POST
  https://<apiDomain>/doc-scans` with an `Authorization: Bearer <apiSharedSecret>` header —
  verified by reading the deployed Pulumi stack state (`pulumi stack output` or the GCP Console's
  Cloud Scheduler page) after a real `pulumi up`, not merely that the TypeScript compiles.
  **Human-only prerequisite, not automatable:** `pulumi config set --secret apiSharedSecret <same
  value as the PROD_API_SHARED_SECRET GitHub secret>` must be run once before the first `pulumi up`
  that includes this job, or the scheduled job's Authorization header is empty and every scheduled
  invocation gets `401`ed by `apps/api/src/server.ts`'s existing auth check.
- No changes to any other Cloud Run service, domain mapping, or service account — additive-only
  infra change, same "Pulumi owns the shell, CI owns the app's env vars" split the rest of
  `infra/index.ts` already follows.

**E2E (run against the merged `main` checkout, per this project's documented `SOURCE_REPO` pinning
in `verification-repo/playwright.post-anki.config.ts` — a worktree-local pass alone is not proof):**
- `@doc-changelog-scan.S5` — clicking "Scan now" surfaces both suggestion kinds with reason text
  and a "doc-scan" label, exactly one mocked agent call.
- `@doc-changelog-scan.S6` — accepting a new-topic suggestion creates a real node, visible on the
  map under the correct parent.
- `@doc-changelog-scan.S7` — rejecting a new-topic suggestion creates no node; the suggestion is
  recorded as rejected, not deleted.
- `@doc-changelog-scan.S8` — accepting a supersession suggestion shows the "possibly outdated"
  badge; the node's percent badge is provably unchanged (negative assertion).
- `@doc-changelog-scan.S9` — rejecting a supersession suggestion leaves no badge, node untouched.

(SCENARIOS 1, 2, 3, 4, 10 are backend/vitest-only — see their proofs above under Backend, not
repeated here. SCENARIO 3 is the load-bearing proof for the wishlist's explicit "never a firehose"
constraint.)

### Consistency gate log

1. **Scenario → Acceptance** — PASS. Every `SCENARIO N` in `scenarios.md` has a full `Acceptance`
   block naming BE/FE/Infra explicitly (`None` where not applicable).
2. **Scenario → e2e box** — PASS. S5–S9 each carry one unchecked `[ ] @doc-changelog-scan.SN — e2e
   test written`; S1–S4, S10 are explicitly vitest-only with no e2e box, matching item 7's own
   precedent for its pure-logic/orchestrator scenarios.
3. **Scenario → state contract** — PASS. Every e2e scenario has a `state-fixtures.md` row with a
   concrete entity/property list, subject/scenery tagging, state source, reseed strategy.
4. **Scenario → action map** — PASS. Every e2e scenario appears in `playwright.md`'s map; every
   action gap is in the consolidated table with its used-by list.
5. **Diagram → scenario/architecture** — PASS. The one Mermaid diagram (in `architecture.md`) maps
   to the real scan/watermark/suggestion flow it depicts.
6. **Deriver (rare, e2e-first)** — PASS. SCENARIO 1's hash/change-detection logic is the only
   pure-logic item; it names its own test file, no deriver forced elsewhere.
7. **Documentation** — PASS. `architecture.md` written; `spec.md`'s Documentation changes section
   commits to `docs/architecture/doc-changelog-scan.md`, doesn't touch item 7's existing doc.
8. **Constitution + framework safety** — INITIAL GAP, FIXED. First pass: S5 depended on an
   unresolved outbound-fetch mock (only flagged as an "open question"), which means
   `/write-playwright-tests` would have had nothing runnable to write for it — exactly the
   "scenario `/implement-playwright` would have to skip" this check exists to catch. Fixed by
   promoting the fix into `spec.md`'s Fetch mechanism section (`E2E_MOCK_TRACKED_TOOL_CONTENT` env
   override, same shape as `resolveAgentModel`'s existing `OPENROUTER_BASE_URL` override) and adding
   its DoD proof. Re-checked: PASS. No scenario seeds its own subject (S5's trigger and S6–S9's
   accept/reject actions are all subject, driven via real UI); no forbidden target; no scenario
   parked as a future `test.skip`; tests run against local e2e Postgres only.
9. **Open questions → carried** — PASS. The one open question (mock-openrouter responder needing
   to return both suggestion kinds in one structured payload, matching the agent's actual Zod
   schema exactly) is carried into `playwright.md`'s Open Questions.

**Consistency gate: PASS — spec.md / scenarios.md / playwright.md / state-fixtures.md /
architecture.md promoted to `state: confirmed`.**
