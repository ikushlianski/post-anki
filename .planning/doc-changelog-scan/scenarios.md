---
type: scenarios
branch: doc-changelog-scan
task: Periodic doc/changelog scan — surface new topics, flag superseded knowledge (issue #49)
state: confirmed
updated: 2026-07-28
---

# Scenarios: Periodic doc/changelog scan

## SCENARIO 1 — Content hashing detects change and non-change identically each time

Pure-logic scenario, no UI/DB surface — vitest only.

**Behavior:**
- Hashing the same truncated tool content twice produces identical hashes (deterministic).
- Hashing content that differs by even one character produces a different hash.
- A simulated fetch failure (rejected `fetchWithTimeout`) returns `null`, distinguishable from "a
  successful fetch whose hash matches the watermark."
- When `E2E_MOCK_TRACKED_TOOL_CONTENT` is set, the fetcher returns that tool's fixed content and
  makes zero real outbound calls (the e2e-stage override — see `spec.md`'s Fetch mechanism
  section).

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/tracked-tool-fetcher.ts exports fetchTrackedTool(tool: TrackedTool):
    Promise<{ content: string; hash: string } | null>
  - Input shapes: a TrackedTool { toolKey, label, sourceUrl }
  - Output shapes: { content: string (truncated), hash: string (sha256 hex) } | null (fetch failed)
  - Edge cases: identical content twice → identical hash; one-char diff → different hash; fetch
    rejects → null, not a thrown error; E2E_MOCK_TRACKED_TOOL_CONTENT set for this tool_key →
    returns that fixed content, fetchWithTimeout never called (call-count assertion)
Behavior: as described above
Integration: None
Observability: None
Tests:
  [ ] apps/api/src/domain-map/tracked-tool-fetcher.test.ts covers all 4 cases with a mocked
      fetchWithTimeout
```

---

## SCENARIO 2 — First-ever scan treats every tool as changed, exactly one agent call

Backend/vitest scenario (orchestrator layer, mocked fetch + mocked agent).

**Narrative:** No `tracked_tool_scan_state` rows exist yet for a gated subject. A scan runs. Since
every tracked tool has no prior watermark, all are treated as "changed." The orchestrator fetches
all 4, calls the agent exactly once with all 4 tools' content, and persists a watermark row per
tool.

**Concrete initial state:** A subject with a domain tree (reused `seedDomainMapFixture`), zero
`tracked_tool_scan_state` rows, zero pre-existing suggestion rows of either kind. Mocked
`fetchWithTimeout` returns fixed distinct content per tool. Mocked `doc-scan` agent returns a fixed
payload: 1 new-topic suggestion (parent path resolves to a real seeded node), 1 supersession
suggestion (path resolves to a real seeded node).

**Setup role:** Subject + tree = scenery (seeded). Mocked fetch responses + mocked agent response =
scenery. **The scan run itself and its resulting rows** = subject (what this scenario verifies).

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/doc-scan.orchestrator.ts: runDocScan(subjectId) — fetches all
    TRACKED_TOOLS entries, compares each against tracked_tool_scan_state (absent = "changed"),
    builds one prompt (tree + all changed tools' content), calls the docScan agent exactly once,
    resolves returned paths via domain-node-name-resolver.ts, inserts resolved suggestions into
    domain_topic_suggestions / domain_supersession_suggestions, upserts
    tracked_tool_scan_state for every tool included in the call
  - Input shapes: subjectId: string
  - Output shapes: DocScanResult { newTopicSuggestions, supersessionSuggestions, toolsScanned:
    string[], toolsChanged: string[], agentCalled: boolean }
  - Edge cases: a suggestion whose path doesn't resolve → dropped, not inserted, not thrown
Behavior:
  - Exactly one call to the mocked agent, verified via call-count assertion
  - 4 tracked_tool_scan_state rows inserted, each with a non-null last_content_hash
  - 1 domain_topic_suggestions row + 1 domain_supersession_suggestions row, both source: "doc-scan",
    status: "pending"
Integration:
  - Real SELECTs against all 3 new tables after the call return the expected row counts and field
    values
Observability: None
Tests:
  [ ] apps/api/src/domain-map/doc-scan.orchestrator.test.ts covers: first-ever scan → 1 agent call,
      4 watermark rows inserted, 1 row in each suggestion table
```

---

## SCENARIO 3 — Second run against unchanged content makes zero agent calls, zero new rows (the "never a firehose" proof)

Backend/vitest scenario. This is the load-bearing proof for the wishlist's explicit constraint.

**Narrative:** Following directly on SCENARIO 2's first run (watermarks now populated), `runDocScan`
is called again with mocked fetches returning byte-identical content to the first run. Nothing
changed, so nothing happens: no agent call, no new suggestion rows.

**Concrete initial state:** Same subject/tree as SCENARIO 2, but now with SCENARIO 2's resulting 4
`tracked_tool_scan_state` rows already present (their real hashes from the first run). Mocked
`fetchWithTimeout` returns the exact same content per tool as SCENARIO 2's first run.

**Setup role:** Subject + tree + existing watermark rows = scenery (produced by SCENARIO 2's own
run, or seeded directly with identical hashes). **The second scan run and its (lack of) side
effects** = subject.

**Acceptance:**
```
Code: (same runDocScan() as SCENARIO 2 — this scenario exercises its "unchanged" branch)
Behavior:
  - Zero calls to the mocked agent — call-count assertion, not just "no new suggestions"
  - Zero new rows in domain_topic_suggestions or domain_supersession_suggestions
  - DocScanResult.agentCalled === false, toolsChanged: []
Integration:
  - Real SELECT counts on domain_topic_suggestions and domain_supersession_suggestions before and
    after the second run are identical
Observability: None
Tests:
  [ ] apps/api/src/domain-map/doc-scan.orchestrator.test.ts covers: two consecutive runs, second
      with identical mocked fetch content → zero agent calls, zero new rows on the second run
```

---

## SCENARIO 4 — Only changed tools are included in the agent prompt

Backend/vitest scenario.

**Narrative:** Of 4 tracked tools, only 1's mocked content differs from its stored watermark. The
orchestrator still calls the agent exactly once (never per-tool), but the prompt it builds contains
only that one tool's content — the 3 unchanged tools are excluded, both for cost discipline and
because their content genuinely hasn't moved.

**Concrete initial state:** 4 existing `tracked_tool_scan_state` rows (from a prior run). Mocked
`fetchWithTimeout` returns 3 tools' content matching their stored hash, and 1 tool's content
different from its stored hash.

**Setup role:** Subject + tree + existing watermark rows = scenery. **The scan run and the exact
content it forwards to the agent** = subject.

**Acceptance:**
```
Code: (same runDocScan())
Behavior:
  - Exactly one agent call
  - The call's captured prompt argument contains the changed tool's label/content and does NOT
    contain any of the 3 unchanged tools' content or labels
  - toolsChanged === [the one tool's key]
Integration: None (pure orchestrator-level assertion on the mocked agent's call arguments)
Observability: None
Tests:
  [ ] apps/api/src/domain-map/doc-scan.orchestrator.test.ts covers: 1-of-4-changed → 1 agent call,
      prompt contains only the changed tool's content
```

---

## SCENARIO 5 — Manual "Scan now" trigger surfaces both suggestion kinds with reason + source label

**Narrative:** The user opens `/subject/:subjectId/priority-review`, finds the new "Doc/changelog
scan" section, clicks "Scan now". After a short loading state, both new sections populate: "New
topics found" shows the proposed node with its reason; "Possibly outdated" shows the flagged
existing node with its reason. Both rows show a "doc-scan" source label.

**Concrete initial state:** Subject with a domain tree (reused `seedDomainMapFixture`), zero
existing `tracked_tool_scan_state` rows (first scan), zero pre-existing suggestions of either kind.
Mocked `fetchWithTimeout` (server-side, not through the browser) returns fixed distinct content per
tool. Mocked `mock-openrouter` `doc-scan` responder returns a fixed payload: 1 new-topic suggestion
(parent path resolves to a real seeded node, e.g. attaches under "Frontend"), 1 supersession
suggestion (path resolves to the seeded "Next.js" node).

**Setup role:** Subject + tree = scenery (seeded via `seedDomainMapFixture`). Mocked fetch + mocked
agent response = scenery. **The "Scan now" click and the resulting rendered suggestions** = subject
(driven via real UI click, what this scenario verifies).

**UI clicking notes:** Clicking "Scan now" disables the button and shows a small inline spinner
(same posture as item 7's "trigger review" — a real, potentially multi-second call, not a blocking
full-page spinner). On success, the button re-enables and both new sections populate below the
existing target-depth-suggestions section. On failure (the orchestrator's silent-fallback path —
Decisions #8), the sections simply stay empty and a small inline "no new suggestions this scan"
message appears rather than an error state, since a failed background-style scan producing nothing
is not distinguishable from — and should read identically to — "nothing changed."

**Acceptance:**
```
Code:
  - apps/web/src/domain-map/priority-review-panel.tsx: "Scan now" button calls triggerDocScan
    (POST /subjects/:id/doc-scans); renders returned newTopicSuggestions and
    supersessionSuggestions lists, each item showing reason text and a static "doc-scan" label
  - apps/api/src/domain-map/domain-map.controller.ts: handleTriggerDocScan,
    handleListDocScanSuggestions (GET /subjects/:id/doc-scan-suggestions?status=pending)
Behavior:
  - Every rendered new-topic suggestion shows: proposed node name, parent context, reason, source
    label
  - Every rendered supersession suggestion shows: flagged node name, reason, source label
Integration:
  - The lists rendered immediately after the scan match exactly the rows returned by
    GET /subjects/:id/doc-scan-suggestions?status=pending on a fresh page load
Observability: None
Tests:
  [x] @doc-changelog-scan.S5 — e2e test written
```

---

## SCENARIO 6 — Accepting a new-topic suggestion creates a real node under the correct parent

**Narrative:** From the "New topics found" list, the user clicks "accept" on a suggestion proposing
a node under "Frontend". The suggestion moves out of "pending". Navigating to the domain map shows
the new node as a child of "Frontend".

**Concrete initial state:** One pre-seeded pending `domain_topic_suggestions` row
(`proposed_parent_node_id`: the seeded "Frontend" node's id, `proposed_node_name`: "Astro",
`status: "pending"`) via back-door seed — not produced through a live agent call, keeping this
scenario focused on accept behavior, not scan-triggering (same posture item 7 took for its own
accept/reject scenarios).

**Setup role:** Subject + tree + the pending suggestion = scenery (seeded). **The accept action and
its effect (a real new node)** = subject.

**UI clicking notes:** Clicking "accept" is a single click, no confirmation modal (reversible — a
newly-created node can always be removed by hand later via existing domain-map editing, if any;
low-stakes). Success indicator: the suggestion row disappears from "pending" and a brief inline
confirmation ("Astro added under Frontend") appears.

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/domain-map.controller.ts: handleResolveDomainTopicSuggestion validates
    { status: "accepted" | "rejected" }, calls resolveDomainTopicSuggestion(id, status) which —
    for "accepted" — calls the existing insertDomainNode() under proposed_parent_node_id and sets
    created_domain_node_id + resolved_at on the suggestion, in one transaction
  - Input shapes: PATCH /domain-topic-suggestions/:id body { status: "accepted" }
  - Output shapes: 200 with the updated suggestion (including created_domain_node_id); 404 if the
    suggestion doesn't exist
Behavior:
  - Accepting creates exactly one new domain_nodes row with parentId === proposed_parent_node_id
    and name === proposed_node_name
Integration:
  - GET /subjects/:id/domain-map after accept shows the new node as a child of "Frontend"
Observability: None
Tests:
  [x] @doc-changelog-scan.S6 — e2e test written
```

---

## SCENARIO 7 — Rejecting a new-topic suggestion creates no node, recorded not deleted

**Narrative:** From the "New topics found" list, the user clicks "reject". It disappears from
"pending". No new node is created. The suggestion row still exists, marked rejected.

**Concrete initial state:** Same shape as SCENARIO 6, one pending `domain_topic_suggestions` row.

**Setup role:** Subject + tree + pending suggestion = scenery (seeded). **The reject action and the
negative assertion that no node was created** = subject.

**Acceptance:**
```
Code: (shares handleResolveDomainTopicSuggestion with SCENARIO 6 — status: "rejected" branch)
Behavior:
  - Rejecting sets status: "rejected", resolved_at: <timestamp>, created_domain_node_id stays null
  - No domain_nodes row is created (negative assertion, not just "no error")
Integration:
  - Real SELECT on domain_nodes shows the same row count for the subject before and after reject
  - Real SELECT on domain_topic_suggestions shows the row still exists with status: "rejected"
    (not deleted — row count unchanged, not decremented)
Observability: None
Tests:
  [x] @doc-changelog-scan.S7 — e2e test written
```

---

## SCENARIO 8 — Accepting a supersession suggestion flags the node without touching its percent

**Narrative:** From the "Possibly outdated" list, the user clicks "accept" on a suggestion flagging
"Next.js". A "possibly outdated" badge appears next to Next.js's existing percent badge on the
domain map. The percent badge itself is unchanged — this is the concrete proof of Decisions #2
("flag, never reduce percent").

**Concrete initial state:** One pre-seeded pending `domain_supersession_suggestions` row
(`domain_node_id`: the seeded "Next.js" node, which has a real non-zero `percent` from an attached,
studied curriculum reused from `seed-knowledge-map`'s own fixture shape) via back-door seed.

**Setup role:** Subject + tree + the pending suggestion = scenery (seeded). **The accept action and
its effect on the node (a flag, not a percent change)** = subject.

**UI clicking notes:** Single click, no confirmation modal. Success indicator: the badge appears in
place next to the percent badge (React state update from the mutation response), no toast, no full
page reload required.

**Acceptance:**
```
Code:
  - apps/api/src/domain-map/domain-map.controller.ts: handleResolveDomainSupersessionSuggestion
    validates { status: "accepted" | "rejected" }, calls resolveDomainSupersessionSuggestion(id,
    status) which — for "accepted" — sets domain_nodes.superseded_at = now(),
    superseded_reason = <the suggestion's reason>, and resolved_at, in one transaction
  - apps/web/src/domain-map/domain-map-tree.tsx: renders a "possibly outdated" badge when a node's
    supersededAt is non-null, next to the existing percent badge
  - Input shapes: PATCH /domain-supersession-suggestions/:id body { status: "accepted" }
Behavior:
  - Accepting sets superseded_at/superseded_reason on the flagged node
  - The flagged node's percent (from domainNodeProgress()) is byte-identical before and after the
    accept — negative assertion proving Decisions #2
Integration:
  - GET /subjects/:id/domain-map after accept shows supersededAt non-null on the correct node and
    percent unchanged on every node in the tree, including the flagged one
Observability: None
Tests:
  [x] @doc-changelog-scan.S8 — e2e test written
```

---

## SCENARIO 9 — Rejecting a supersession suggestion leaves the node unflagged

**Narrative:** From the "Possibly outdated" list, the user clicks "reject". No badge appears on the
domain map. The suggestion is recorded as rejected, not deleted.

**Concrete initial state:** Same shape as SCENARIO 8, one pending `domain_supersession_suggestions`
row.

**Setup role:** Subject + tree + pending suggestion = scenery (seeded). **The reject action and the
negative assertion that no flag was set** = subject.

**Acceptance:**
```
Code: (shares handleResolveDomainSupersessionSuggestion with SCENARIO 8 — status: "rejected" branch)
Behavior:
  - Rejecting sets status: "rejected", resolved_at: <timestamp>, superseded_at stays null on the
    domain_node
Integration:
  - Real SELECT on domain_nodes shows superseded_at === null for the target node after reject
  - Real SELECT on domain_supersession_suggestions shows the row still exists with
    status: "rejected"
Observability: None
Tests:
  [x] @doc-changelog-scan.S9 — e2e test written
```

---

## SCENARIO 10 — Agent failure mid-scan leaves changed tools' watermark un-advanced (anti-data-loss)

Backend/vitest scenario (orchestrator layer) — the concrete proof behind Decisions #9.

**Narrative:** 2 of 4 tracked tools have changed content this run. The mocked `doc-scan` agent call
rejects (simulated network error). The orchestrator does not throw — it returns a result with
`agentCalled: false` — but critically, the 2 changed tools' `tracked_tool_scan_state` rows are left
at their OLD hash (not advanced to the new, unprocessed content's hash), so the next scheduled run
will see them as "changed" again and retry, rather than silently treating this run's failure as "we
already checked, nothing to report."

**Concrete initial state:** 4 existing `tracked_tool_scan_state` rows with known hashes. Mocked
`fetchWithTimeout` returns content matching 2 tools' stored hash (unchanged) and different content
for the other 2 (changed). Mocked agent call rejects.

**Setup role:** Subject + tree + existing watermark rows = scenery. **The failed scan run and its
watermark side effects (or lack thereof)** = subject.

**Acceptance:**
```
Code: (same runDocScan() — this scenario exercises its agent-rejection branch)
Behavior:
  - runDocScan() resolves (does not throw), returning { agentCalled: false, newTopicSuggestions:
    [], supersessionSuggestions: [], toolsChanged: [<the 2 changed tool keys>] }
  - Zero new rows in domain_topic_suggestions or domain_supersession_suggestions
  - The 2 changed tools' tracked_tool_scan_state.last_content_hash rows are UNCHANGED from before
    the call (still the old hash — this is the negative assertion that matters)
  - The error is logged (log.error call assertion, not swallowed silently at the logging layer)
Integration:
  - POST /subjects/:id/doc-scans (or POST /doc-scans) still responds 200, never 502 — this is a
    background-job-shaped failure, not a foreground one (Decisions #8)
Observability:
  - log.error is called with a message identifying doc_scan_agent_failed (or equivalent), so a
    human reviewing logs can notice, even though nothing surfaces to the UI/scheduler
Tests:
  [ ] apps/api/src/domain-map/doc-scan.orchestrator.test.ts covers: 2-of-4-changed + rejected agent
      call → no throw, 0 new rows, the 2 changed tools' watermark hash unchanged from before the
      call
```
