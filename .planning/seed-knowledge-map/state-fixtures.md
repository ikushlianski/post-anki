---
type: state-fixtures
branch: seed-knowledge-map
task: seed-knowledge-map
state: confirmed
target-project: post-anki
target-feature: features/domain-map
local-db-inspected-at: 2026-07-28 (schema/code inspection only — see note below)
existing-state-mocks-snapshot: [none applicable — post-anki's verification-repo project uses a plain
  Postgres db/ helper (countWhere, rowExists, getRow) rather than Neo4j state-mock files; the "state
  mock" concept in the base plan-playwright template is Neo4j/mathaul-specific, already noted by this
  same worktree's sibling plan phrase-bank-concurrency-fix/state-fixtures.md]
proposed-new-state-mocks: [seedDomainMapFixture — a new test-only Postgres seed helper, not an app
  file; see below]
updated: 2026-07-28
---

# State fixtures — Seed subjects and courses/topics

## Note on scope

Postgres-only project, no Neo4j — same divergence from the base template already documented by
`phrase-bank-concurrency-fix/state-fixtures.md` in this same worktree. The equivalent contract here:
what does each scenario need in the local e2e Postgres before it runs, and how is that state produced
(front-door UI action vs. back-door seed).

Two proof mechanisms are in play:

- **The e2e Postgres via Playwright** (`localhost:5436`) — used by SCENARIOS 3, 4, 5, 7, 8, 9 via the
  standard `dev:pw` orchestration (docker up → migrate → mock-openrouter → web/api → Playwright run).
- **The same e2e Postgres, driven directly by vitest** — used by SCENARIOS 1, 2, 6's integration/unit
  tests (source-repo tests, not verification-repo Playwright tests — documented here for completeness
  since `spec.md`'s Definition of Done covers both proof mechanisms, but not run by
  `/review-playwright`).

## The seed fixture every Playwright scenario shares

`seedDomainMapFixture(subjectId)` — a new test-only helper (lives in the verification-repo project's
test-support code, not the app; proposed shape below for `/implement-playwright` to author) that
inserts, directly via SQL/repo calls (back door — never through the UI, since re-clicking "add course
here" a dozen times to build a test tree would defeat the point of testing placement, not tree
construction):

```
Programming / Web Development (the subjectId passed in — created fresh per test via createSubject)
├── Frontend
│   └── Meta-frameworks
│       ├── Next.js       (no curriculum attached — S4's match target, S8's studied leaf)
│       └── Nuxt.js       (no curriculum attached, no descendants — S7's "must read 0%" node)
└── Backend                (no curriculum attached — S9's re-pointing target)
```

Kept intentionally smaller than SCENARIO 1's real starter hierarchy (which has ~14 nodes across 4
branches) — this fixture only needs to exercise the specific paths each scenario's Acceptance block
names, not reproduce the full seed script's output. SCENARIO 1 already proves the real seed script
separately, against its own real "Programming / Web Development" subject.

## Per-scenario state contract

### S1, S2, S6 — see `spec.md`'s Definition of Done (Backend section) for their proof mechanism;
recorded here only for completeness per this file's own contract.

- S1: fresh e2e Postgres, migrated, no pre-existing `domain_nodes` rows for the test's own subject
  scope; the "Programming / Web Development" subject itself is a precondition the test creates via
  `seed-subjects.ts`'s own insert path (or a direct equivalent insert) before running the script under
  test.
- S2: no DB at all — pure function, in-memory fixture arrays constructed inline in the test file.
- S6: e2e Postgres, one real subject + curriculum-creation call, mocked agent (vi.mock) — no seeded
  tree needed, since this proves the *failure* path, which by definition never reads the tree.

### S3 — Explicit placement via the tree UI

- **State source:** `additive-seed`.
- **Setup role:** Subject = the curriculum's creation + placement (front door — real
  `addCourseUnderNode` click-through). Scenery = the subject (front door via `createSubject`, itself
  scenery relative to *this* scenario's own subject-under-test) + the seeded tree
  (`seedDomainMapFixture`, back door).
- **Concrete state required:**

  | Entity | Key properties | Source |
  |---|---|---|
  | `subjects` row | fresh, `kind: 'architecture-mentor'` | front door (`createSubject`) |
  | `domain_nodes` rows | Frontend → Meta-frameworks → {Next.js, Nuxt.js}; Backend (sibling root) | back door (`seedDomainMapFixture`) |

- **Reseed strategy:** `wipe-and-replay-baseline-plus-mocks` does not apply (no baseline concept in
  this project). Closest accurate label: **fresh-subject-per-test** — every test creates its own
  subject via `createSubject` with a unique name, so no truncation/reset step is needed between tests;
  isolation comes from each test owning a distinct `subjectId` scope, same shape
  `phrase-bank-concurrency-fix/state-fixtures.md` already used for its own concurrency tests.
- **Mutations the scenario makes:** inserts one `curricula` row with `domain_node_id` set to the
  "Meta-frameworks" node's real id; the existing `curriculum-architect` mock-openrouter responder also
  fires (unrelated structure generation), inserting `modules`/`topics` rows — not asserted on by this
  scenario, only the placement is.

### S4 — Silent exact match

- **State source:** `additive-seed`, same fixture as S3 (a fresh subject + `seedDomainMapFixture` per
  test — not shared with S3's own test run).
- **Setup role:** Subject = the placement-resolution logic (front door — a real `createCurriculumByName`
  call whose name is chosen to normalized-match "Next.js"). Scenery = subject + tree, same as S3.
- **Concrete state required:** same table as S3.
- **Reseed strategy:** `fresh-subject-per-test`, same as S3.
- **Mutations:** one `curricula` row, `domain_node_id` = the pre-existing "Next.js" node's id — no new
  `domain_nodes` row created (asserted directly: node count for the subject unchanged before/after).

### S5 — Ambiguous placement via the agent

- **State source:** `additive-seed`, same fixture shape as S3/S4.
- **Setup role:** Subject = the agent call + resulting node creation (front door — real
  `createCurriculumByName` with a name, "Astro", that matches nothing in the seeded tree). Scenery =
  subject + tree (as S3) + the mocked agent response (`MOCK_SIBLING_DISCOVERY_ASTRO`, itself scenery —
  a fixed LLM output, not something the test drives).
- **Concrete state required:** S3's table, plus the `sibling-discovery` mock-openrouter responder must
  be registered and reachable at `mock-openrouter`'s configured URL for the e2e stack (verified at
  orchestration time, not per-scenario).
- **Reseed strategy:** `fresh-subject-per-test`.
- **Mutations:** new `domain_nodes` rows for "Astro" + its mocked sibling suggestions (e.g. "Qwik",
  "SvelteKit"), all parented under "Meta-frameworks"; one `curricula` row with `domain_node_id` set to
  the new "Astro" node.

### S7 — Unstudied node renders at 0%

- **State source:** `additive-seed`, same fixture as S3.
- **Setup role:** Subject = the read/render of the "Nuxt.js" node specifically (front door — a real
  page navigation + DOM read; no mutation in this scenario at all). Scenery = subject + tree.
- **Concrete state required:** S3's table — specifically, "Nuxt.js" must have zero curricula anywhere
  in its subtree (true by construction of the fixture — it's a childless leaf with nothing attached).
- **Reseed strategy:** `fresh-subject-per-test`.
- **Mutations:** none — pure read scenario.

### S8 — Studied node rollup, visible on ancestors

- **State source:** `additive-seed`, S3's tree fixture **plus** a back-door curriculum seed.
- **Setup role:** Subject = the read/render of three specific nodes' rollup percentages (front door —
  page navigation + DOM read). Scenery = subject + tree (S3) + a back-door-seeded curriculum with
  modules/topics carrying fixed `topics.progress_maturity` values (e.g. `[80, 40, 0]`), directly
  inserted with `domain_node_id` set to "Next.js" — **not** created through the UI, since this
  scenario is about the rollup read path, not curriculum-creation-with-real-progress (which would
  require a full probe/grading session, out of scope here — see `spec.md`'s Scope boundary).
- **Concrete state required:**

  | Entity | Key properties | Source |
  |---|---|---|
  | `subjects`/`domain_nodes` | as S3 | front door + back door |
  | `curricula` row | `domain_node_id`: Next.js node's id | back door (direct insert, not via UI) |
  | `modules`/`topics` rows | topics with `progress_maturity` values `[80, 40, 0]` (mixed, not
    all-mastered — deliberately chosen so the expected rollup number isn't a degenerate 0 or 100) | back door |

- **Reseed strategy:** `fresh-subject-per-test`.
- **Mutations:** none from the scenario's own action (pure read) — the back-door seed is setup, not a
  scenario mutation.

### S9 — Changing placement

- **State source:** `additive-seed`, S3's tree fixture **plus** a back-door curriculum seed.
- **Setup role:** Subject = the re-pointing operation itself (front door — real `changePlacement`
  select + submit). Scenery = subject + tree (S3) + a curriculum already back-door-attached to the
  "Astro" node before the test's own action runs (this scenario doesn't depend on S5 having run in the
  same suite — it seeds its own already-placed curriculum directly, same reasoning as S8).
- **Concrete state required:**

  | Entity | Key properties | Source |
  |---|---|---|
  | `subjects`/`domain_nodes` | as S3, plus an "Astro" node under Meta-frameworks (back-door-inserted for this test, since S9 doesn't depend on S5's agent path having created it) | front door + back door |
  | `curricula` row | `domain_node_id`: Astro node's id (pre-attached) | back door |

- **Reseed strategy:** `fresh-subject-per-test`.
- **Mutations:** the scenario's own action updates the seeded curriculum's `domain_node_id` from
  Astro's id to Backend's id — asserted via both the DOM and a real `GET /subjects/:id/domain-map`
  response, per `scenarios.md`'s Integration section for S9.

## State suites

No suite sharing — every scenario in this plan gets its own fresh subject via `createSubject` with a
unique name, so no scenario depends on another's mutations persisting. Each runs independently and in
any order.

## Forbidden mutations

Not applicable — no `read-only-mathaul-dev`-equivalent target exists in this project; the e2e Postgres
is local-only and fully mutable by design.

## Open questions

None. See `playwright.md`'s "Open questions" section for the same conclusion and why.
