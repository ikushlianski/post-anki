---
type: state-fixtures
branch: decide-mode
task: decide-mode
state: confirmed
target-project: post-anki
target-feature: features/decide
local-db-inspected-at: 2026-07-28
existing-state-mocks-snapshot: []
proposed-new-state-mocks: []
updated: 2026-07-28
---

# State fixtures — Opinion-First Decision Training mode (/decide)

The exact initial state every scenario in `scenarios.md` requires before its first Playwright
action runs.

## Source inventory

**Existing state mocks reused:** none — `/decide` has no subject/curriculum/topic dependency, so
none of the existing state-mock library (all scoped to subjects/curricula) applies.

**Proposed new state mocks:** none needed. Every scenario's state is either `baseline-only` (the
project's standard empty e2e Postgres, migrated, no app-level seed) or self-produced in-test via a
real `submitDecide` front-door action (S3's setup step) — never a back-door DB seed.

**Local-DB inspection summary:** N/A for this feature — `decide_sessions` /
`decide_blind_spots` are new tables with no existing rows anywhere (not yet migrated); there is no
ambient local data this plan could accidentally depend on, unlike subject/curriculum-scoped
features where the developer's local DB may already hold relevant rows.

## Per-scenario state contract

### S1 — User reasons through a decision, gets structured gap analysis

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` (standard project default — no
  decide-specific mocks to replay)
- **Concrete state required (every entity must exist before the first Playwright action):**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | (none — `decide_sessions`/`decide_blind_spots` tables exist, empty) | — | migration only | subject: the session created in-test |

- **Mutations the scenario will make:** creates one `decide_sessions` row + N `decide_blind_spots`
  rows via the real `POST /decide-sessions` flow.

---

### S2 — Decision history survives a reload, newest first

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | (none pre-existing) | — | — | subject: two sessions created in-test, in sequence |

- **Mutations the scenario will make:** creates two `decide_sessions` rows (+ their blind spots)
  via two sequential real `submitDecide` calls, in order A then B.

---

### S3 — Flagging a blind spot as a gap to revisit persists

- **State source:** `baseline-only`, with in-test setup (not a seed)
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:**

  | Entity | Key properties | Source | Setup role |
  |---|---|---|---|
  | `decide_sessions` row + ≥1 `decide_blind_spots` row (`status='pending'`) | produced by the `decide-jwt-vs-server-sessions` fixture, which must yield ≥2 blind spots | in-test `submitDecide` call (setup step, not asserted on) | scenery, produced front-door; no seed path exists |

- **Mutations the scenario will make:** the setup `submitDecide` call (scenery-producing), then
  the subject action: `PATCH /decide-blind-spots/:id` flips `status` to `accepted` (or `rejected`
  for the negative-path assertion within the same test, per the tinker-step convention) and sets
  `resolvedAt`.

---

### S4 — Whitespace-only decision or opinion never reaches the agent or the database

- **State source:** `baseline-only`
- **State mocks applied:** none
- **Suite:** none
- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks`
- **Concrete state required:** none — this scenario never produces a persisted row; the assertion
  is entirely on client-side button-enabled state plus (optionally) a DB row-count check proving
  no `decide_sessions` row appeared.
- **Mutations the scenario will make:** none (the whole point of the scenario is that no mutation
  happens).

## State suites

No scenario shares state with another across test boundaries — each scenario builds its own state
from a clean slate. No suite grouping needed.

## Forbidden mutations

Not applicable — no `read-only-mathaul-dev`-class target exists in this project; all e2e runs
target the disposable local Docker Postgres (`localhost:5436`), never the Neon prod database.

## Open questions

None. Every state question this feature raises resolves to "baseline-only, produced in-test" —
there was no ambiguity requiring a seed proposal.
