---
type: playwright
branch: decide-mode
task: decide-mode
state: confirmed
target-project: post-anki
target-feature: features/decide
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Opinion-First Decision Training mode (/decide)

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — The mentor never evaluates a decision until the user has written their own opinion first —
  the core "stop being an AI relay" guarantee this whole mode exists for. → S1
- B2 — Every decision the user has reasoned through is kept, so they can look back at what the
  mentor told them without re-describing the same decision. → B2 → S2
- B3 — A blind spot the user recognizes as real can be flagged and stays flagged — the first real,
  queryable signal a future generalized gap tracker (#57) can fold in, not just a one-time read. →
  S3
- B4 — Empty or half-finished submissions never reach the LLM or the database — no wasted cost, no
  junk history. → S4

**UX scenarios**
- U1 — Filling in a decision and an opinion and clicking "Challenge my thinking" shows strengths,
  blind spots, questions, and a verdict — each blind spot individually actionable. → S1
- U2 — Submitting two decisions and reloading shows both, most recent first, with no
  re-evaluation needed. → S2
- U3 — Clicking "Flag as a gap to revisit" on a blind spot marks it, without losing the rest of the
  evaluation on screen, and the flag survives a reload. → S3
- U4 — The submit button won't let you go with a blank or whitespace-only decision or opinion — it
  just stays disabled, for either field independently. → S4

**Not e2e (verified at unit/integration only)**
- Agent-failure branches (thrown error and null structured output, both now unified to a single
  502 response — see spec.md's Route design section) — deterministic mock-agent behaviors with no
  distinct UI surface beyond what S1's happy path already renders; covered by
  `decide.orchestrator.test.ts` per spec.md's Backend DoD, not a separate e2e scenario (mirrors
  `check-my-writing-mode`'s reasoning for not e2e-testing its own agent-null-output branch).
- The legacy `POST /decide` route's removal (`resolveRoute("POST", "/decide") === null`) — a pure
  routing-table assertion with no UI surface, covered by a unit test per spec.md's Backend DoD.
- `decideInput` shared-schema unit coverage (`packages/shared/src/decide.test.ts`, named in S4's
  Acceptance) is genuinely unit-level (pure Zod schema, no UI/flow surface) — listed there, not
  here.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/decide/` — **new folder.** `/decide` is standalone (Decision #2 in spec.md),
  not a sub-feature of `practice/`, `curriculum/`, or any subject-scoped folder — it has its own
  route, its own entity, no subject/topic dependency. Creating a new top-level feature folder
  matches how `probe/` and `tag/` are already their own top-level folders for the same reason
  (standalone concern, not nested under another feature just because it shares infrastructure).
- Target DB: the project's standard e2e Postgres (`localhost:5436`, `e2e/docker-compose.yml`)
- Dev server URL: `http://localhost:3100` (web) / `http://localhost:8031` (api), per `project.json`

## Action surface — snapshot

No actions exist yet in `features/decide/actions/` (new folder — the folder itself doesn't exist
at planning time). All four actions below are gaps.

## Scenario → action + state + testid map

### S1 — User reasons through a decision, submits opinion first, gets structured gap analysis

**Composes actions:** none existing (new feature folder).

**Action gaps:**
- `submitDecide` — params `{ page: Page, decision: string, opinion: string }`, result
  `{ id: string, verdict: string, strengths: string[], blindSpots: { id: string, description:
  string, status: string }[], questions: string[] }`. Navigates to `/decide` if not already
  there, fills `decide-decision-input` then `decide-opinion-input`, asserts
  `decide-submit-button` is enabled, clicks it, waits for the real `submitDecide`-matching
  `/_serverFn/` network response (same base64-marker technique as `checkWriting`'s action —
  `isServerFnResponse` helper from `lib/server-fn-response.ts`), then reads `decide-result`'s
  `data-verdict` plus the three rendered lists and each blind spot's id (read off a
  `data-blind-spot-id` attribute on `decide-blind-spot-item-<n>`, needed by S3 to target a
  specific PATCH).

**Pre-test state:** baseline-only — no subject/topic/curriculum dependency at all.

**Required `data-testid` attributes** (guidance for implementer):
- `decide-decision-input`, `decide-opinion-input`, `decide-submit-button`
- `decide-result` (with `data-verdict`)
- `decide-result-strengths`, `decide-result-questions` (lists)
- `decide-blind-spot-item-<n>` (with `data-blind-spot-id`, `data-status`)
- `decide-blind-spot-description-<n>` — added during implementation (not originally listed here):
  isolates the description text from the sibling flag/dismiss buttons rendered inside the same
  `<li>`, so `submitDecide`'s action can read back just the description without also capturing
  button label text
- `decide-blind-spot-flag-button-<n>`, `decide-blind-spot-dismiss-button-<n>`

**Fixture variants:** `decide-jwt-vs-server-sessions` (mock-openrouter fixture: a
`decideResultSchema`-shaped response with ≥2 blind spots, keyed to a specific decision/opinion
pair so the test can assert deterministic content).

**Vision check candidate:** no — structural assertions (`data-verdict`, list contents, blind-spot
ids) are sufficient.

---

### S2 — Decision history survives a reload, newest first

**Composes actions:** `submitDecide` (×2, for session A then session B).

**Action gaps:**
- `getDecideHistory` — params `{ page: Page }`, result `{ decisions: string[] }` (or richer, per
  implementer's read of what's rendered). Reloads the page, reads
  `decide-history-item-0`/`decide-history-item-1` (etc.) in DOM order, returns their decision
  text for order assertion.

**Pre-test state:** baseline-only. Fresh e2e run's `decide_sessions` table starts empty (no
baseline seed of decide data exists or is needed).

**Required `data-testid` attributes:**
- `decide-history-item-<n>` (containing at minimum the decision text and verdict)

**Fixture variants:** reuses `decide-jwt-vs-server-sessions` from S1 for BOTH submissions — no
second fixture needed. History ordering is asserted on the user-supplied `decision` text (echoed
back from the request, not mock-generated), so this scenario doesn't depend on
`mock-openrouter` discriminating between two different prompts — sidesteps the exact class of gap
`workplace-scenario-packs` found in the mock (see scenarios.md S2's UI-clicking notes).

**Vision check candidate:** no.

---

### S3 — Flagging a blind spot as a gap to revisit persists

**Composes actions:** `submitDecide` (setup — produces the session + blind spots to act on).

**Action gaps:**
- `resolveDecideBlindSpot` — params `{ page: Page, blindSpotId: string, resolution: 'accepted' |
  'rejected' }`, result `{ status: string }`. Clicks the matching
  `decide-blind-spot-flag-button-<n>` or `-dismiss-button-<n>` for the given `blindSpotId` (found
  via the `data-blind-spot-id` attribute S1's action already exposes), waits for the real PATCH
  network response, reads back `decide-blind-spot-item-<n>`'s `data-status`.

**Pre-test state:** `additive` in the sense that the scenario's own setup step (a real
`submitDecide` call) creates the state it needs — not a DB seed. No fixture beyond S1's.

**Required `data-testid` attributes:** `data-status` attribute on `decide-blind-spot-item-<n>`
(already listed under S1, called out again here since S3 is the scenario that actually asserts on
it changing).

**Fixture variants:** reuses `decide-jwt-vs-server-sessions` from S1.

**Vision check candidate:** no.

---

### S4 — Whitespace-only decision or opinion never reaches the agent or the database

**Composes actions:** none (pure form-state assertions, no submission ever succeeds in this
scenario — doesn't need `submitDecide` since the button never becomes clickable in the
whitespace-only states being tested).

**Action gaps:** none new — this scenario drives `decide-decision-input`/`decide-opinion-input`/
`decide-submit-button` directly via Playwright locators, no composed action needed (matches how
`check-writing-blocks-whitespace-only-text` tests the analogous check-writing gate directly).

**Pre-test state:** baseline-only.

**Required `data-testid` attributes:** none beyond S1's (`decide-decision-input`,
`decide-opinion-input`, `decide-submit-button`).

**Fixture variants:** none — never reaches mock-openrouter.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `submitDecide` | S1, S2 (×2), S3 (setup) | No — single-feature flow, no cross-ticket reuse signal yet |
| `getDecideHistory` | S2 only | No |
| `resolveDecideBlindSpot` | S3 only | No |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | baseline-only | no subject/topic dependency |
| S2 | baseline-only | fresh `decide_sessions` table starts empty; no seed needed |
| S3 | baseline-only (self-setup via real submission) | not a DB seed — the setup submission is itself a front-door action |
| S4 | baseline-only | never reaches the DB |

## Open questions

None carried forward — every fork this plan surfaced was resolved during planning (see spec.md's
"Decisions made autonomously"). The one item intentionally deferred, not left open: a nullable
`subjectId` cross-link on `decide_sessions`, explicitly NOT added now (spec.md Decision #2) —
noted here so `/implement-playwright` doesn't add it speculatively either.
