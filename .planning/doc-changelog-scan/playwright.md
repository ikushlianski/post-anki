---
type: playwright
branch: doc-changelog-scan
task: doc-changelog-scan
state: confirmed
target-project: post-anki
target-feature: features/domain-map
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Periodic doc/changelog scan

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Once a week (or on demand), the app checks the real changelogs of the tools the user
  actually tracks and, only when something genuinely changed, proposes either a new topic to add to
  the knowledge map or a flag on an existing topic that newer material may have superseded it — the
  user never has to notice ecosystem drift on their own. → S5
- B2 — A tool whose changelog hasn't moved since the last check produces nothing — no repeated,
  stale, or duplicate suggestions ever pile up. → proven at the backend/vitest layer (S3), not
  independently re-provable through the UI in a way that adds signal beyond S3.
- B3 — Accepting a "new topic" suggestion actually adds it to the knowledge map where it belongs; a
  rejected one leaves the map untouched and is recorded as handled, not silently dropped. → S6, S7
- B4 — Accepting a "possibly outdated" suggestion visibly flags that topic without touching its
  actual progress percentage — the two are independent facts the user can see side by side. →
  S8, S9

**UX scenarios**
- U1 — Clicking "Scan now" on the priority-review screen shows a loading state, then two new
  sections populate with any findings, each with a reason and a "doc-scan" label. → S5
- U2 — Accepting a "new topic" suggestion makes it appear on the domain map under the right parent.
  → S6
- U3 — Rejecting a "new topic" suggestion removes it from "pending" with no other visible change. →
  S7
- U4 — Accepting a "possibly outdated" suggestion shows a badge next to the flagged topic's
  existing percent badge, unchanged. → S8
- U5 — Rejecting a "possibly outdated" suggestion leaves no badge. → S9

**Not e2e (verified at unit/integration only)**
- S1 (hash determinism / fetch-failure detection) — pure logic, no UI/DB surface; covered by
  `apps/api/src/domain-map/tracked-tool-fetcher.test.ts`.
- S2 (first-ever scan: 1 agent call, 4 watermark rows), S3 (**the "never a firehose" proof** —
  second run against unchanged content makes zero agent calls, zero new rows), S4 (only changed
  tools included in the prompt), S10 (agent failure leaves changed tools' watermark un-advanced) —
  all exercised against a mocked fetch layer and a mocked agent at the orchestrator layer
  (`doc-scan.orchestrator.test.ts`); the call-count assertions and the watermark-row assertions are
  both more precisely and more cheaply proven at this layer than through a full browser round-trip
  driving 2+ scan runs. S5 still proves the same end-user-visible mechanism through the UI with a
  single mocked scan.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/domain-map/` (same folder `seed-knowledge-map` and `domain-priority-review`
  both used — extended again, not forked)
- Target DB: `post-anki-e2e` (local docker postgres, `localhost:5436`)
- Dev server URL: `http://localhost:3100`

## Action surface — snapshot (existing, from `seed-knowledge-map` + `domain-priority-review`)

- `openDomainMapPage({ page, subjectId })` — navigates to `/subject/:id/map`.
- `openPriorityReviewPage({ page, subjectId })` — navigates to `/subject/:id/priority-review`,
  waits for `priority-review-panel`.
- `resolveSuggestion({ page, suggestionId, decision })` — clicks accept/reject on a suggestion row
  keyed by testid pattern `priority-review-suggestion-{accept|reject}-<id>`, waits for the row to
  detach.

## Action gaps (new, this plan)

- `triggerDocScan({ page })` — clicks the new "Scan now" button (distinct testid from item 7's
  "trigger review" button — the two are separate actions on the same screen), waits for it to leave
  its busy state. Mirrors `triggerPriorityReview`'s shape exactly. Result: `void`.
- `resolveDocScanSuggestion({ page, suggestionId, kind, decision })` — clicks accept/reject on
  either a new-topic or supersession suggestion row. Params: `{ page: Page, suggestionId: string,
  kind: 'topic' | 'supersession', decision: 'accept' | 'reject' }`. Testid pattern differs by
  `kind` (see testids below) — this is a new action rather than reusing item 7's
  `resolveSuggestion` because the testid namespaces are deliberately distinct (two different
  suggestion tables, two different sections of the screen), even though the click-and-wait
  mechanics are identical; documented here as an explicit alternative considered.

**Alternative considered:** extend `resolveSuggestion` with an optional `kind` param instead of a
new action. Rejected — item 7's `resolveSuggestion` is scoped to
`priority-review-suggestion-*` testids; overloading it to also branch on doc-scan's differently-
namespaced testids would couple two independent features' UI contracts inside one action. A future
refactor could still unify them if the testid namespaces converge.

## Scenario → action + state + testid map

### S5 — "Scan now" surfaces both suggestion kinds with reason + source label

**Composes actions:** `openPriorityReviewPage`
**Action gaps:** `triggerDocScan` (new — see above)
**Pre-test state:** additive-seed, reuses `seedDomainMapFixture` (unchanged — the new columns on
`domain_nodes` are nullable, so the existing fixture needs zero edits); plus
`E2E_MOCK_TRACKED_TOOL_CONTENT` set in the test env (see "Required test-env configuration" below)
and a mocked `doc-scan` responder in `mock-openrouter`.
**Required `data-testid` attributes:**
- `doc-scan-section` — root of the new "Doc/changelog scan" section
- `doc-scan-trigger-button` — "Scan now"
- `doc-scan-new-topic-<id>` — each new-topic suggestion row
- `doc-scan-new-topic-reason-<id>`
- `doc-scan-new-topic-source-<id>` — the "doc-scan" label
- `doc-scan-supersession-<id>` — each supersession suggestion row
- `doc-scan-supersession-reason-<id>`
- `doc-scan-supersession-source-<id>`
**Fixture variants:** `doc-scan-mixed-suggestions` (mock-openrouter responder, new — returns 1
new-topic + 1 supersession suggestion in one structured payload)
**Vision check candidate:** no.

---

### S6 — Accepting a new-topic suggestion creates a node under the correct parent

**Composes actions:** `openPriorityReviewPage`, `openDomainMapPage` (to verify afterward)
**Action gaps:** `resolveDocScanSuggestion` (kind: 'topic', decision: 'accept')
**Pre-test state:** additive-seed — one pre-seeded pending `domain_topic_suggestions` row (back-door
SQL, not via a live scan — see `state-fixtures.md`)
**Required `data-testid` attributes:**
- `doc-scan-new-topic-accept-<id>`
**Fixture variants:** none (reuses S5's row testids).
**Vision check candidate:** no.

---

### S7 — Rejecting a new-topic suggestion creates no node, recorded not deleted

**Composes actions:** `openPriorityReviewPage`
**Action gaps:** shares `resolveDocScanSuggestion` with S6 (decision: 'reject')
**Pre-test state:** additive-seed — one pre-seeded pending `domain_topic_suggestions` row
**Required `data-testid` attributes:**
- `doc-scan-new-topic-reject-<id>`
**Fixture variants:** none.
**Vision check candidate:** no.

---

### S8 — Accepting a supersession suggestion flags without touching percent

**Composes actions:** `openPriorityReviewPage`, `openDomainMapPage` (to verify the badge + unchanged
percent afterward)
**Action gaps:** shares `resolveDocScanSuggestion` with S6/S7 (kind: 'supersession', decision:
'accept')
**Pre-test state:** additive-seed — one pre-seeded pending `domain_supersession_suggestions` row on
a node with a real non-zero percent (reuses `seed-knowledge-map`'s studied-curriculum fixture shape
via `seedStudiedCurriculumUnderNode`)
**Required `data-testid` attributes:**
- `doc-scan-supersession-accept-<id>`
- `domain-map-node-superseded-badge-<nodeId>` — the new badge, rendered beside the existing
  `domain-map-node-percent-<nodeId>`
**Fixture variants:** none.
**Vision check candidate:** no.

---

### S9 — Rejecting a supersession suggestion leaves the node unflagged

**Composes actions:** `openPriorityReviewPage`, `openDomainMapPage`
**Action gaps:** shares `resolveDocScanSuggestion` with S8 (decision: 'reject')
**Pre-test state:** additive-seed — one pre-seeded pending `domain_supersession_suggestions` row
**Required `data-testid` attributes:**
- `doc-scan-supersession-reject-<id>`
**Fixture variants:** none.
**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `triggerDocScan` | S5 | No — single-scenario, mirrors an existing pattern (`triggerPriorityReview`) |
| `resolveDocScanSuggestion` | S6, S7, S8, S9 | No — mirrors existing `resolveSuggestion`, not a new pattern |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S5 | additive-seed | zero pre-existing suggestions/watermark rows; mocked fetch + mocked agent |
| S6 | additive-seed | one pre-seeded pending `domain_topic_suggestions` row |
| S7 | additive-seed | one pre-seeded pending `domain_topic_suggestions` row |
| S8 | additive-seed | one pre-seeded pending `domain_supersession_suggestions` row + studied curriculum |
| S9 | additive-seed | one pre-seeded pending `domain_supersession_suggestions` row |

## Open questions

- The `doc-scan` mock-openrouter responder's structured-output payload shape must match the actual
  `docScanAgentResultSchema` exactly once that Zod schema is authored during implementation — plan
  the responder's shape from `spec.md`'s described schema, but confirm against the real schema file
  before locking the mock response.

(The outbound-tool-fetch mocking mechanism itself — `E2E_MOCK_TRACKED_TOOL_CONTENT` — is resolved
in `spec.md`'s Fetch mechanism section, not left open; S5's Required env row below is its
consequence, not a remaining unknown.)

## Required test-env configuration for S5

Unlike item 7 (whose trigger reads only from the DB before reaching the mockable LLM call), this
feature's orchestrator makes a real outbound HTTPS call to GitHub before the LLM is ever involved.
S5's test setup must set `E2E_MOCK_TRACKED_TOOL_CONTENT` (JSON, keyed by `tool_key`) in the e2e
stage's env before the test runs, so `tracked-tool-fetcher.ts` never reaches the real network —
same posture as `mock-openrouter`'s `OPENROUTER_BASE_URL` override for the LLM half.
