---
type: playwright
branch: ontology-audit-trail
task: ontology-audit-trail
state: confirmed
target-project: post-anki
target-feature: features/admin-observability
actions-snapshot-date: 2026-07-31
updated: 2026-07-31
---

# Playwright readiness — Merge/split audit trail

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — After merging two subjects, a human can open one page and see exactly what merged into
  what, when, and how many records moved — enough to manually reconstruct a mistaken merge without
  guessing from the database directly. → S1
- B2 — That same page correctly shows merge history for every kind of merge the app supports
  (subjects, tags, curricula, domain-map nodes), not just the one the reviewer happens to test. →
  S5

**UX scenarios**
- U1 — A user merges two subjects the normal way (the existing merge button on the subject card);
  afterward, `/admin-observability` shows a new row naming both subjects and what moved. → S1
- U2 — Visiting `/admin-observability` with merge history already present shows a readable table —
  entity kind, target, source, what moved, when — for every entity type at once. → S5

(Each B/U item links to its detailed S-row in the mapping below.)

**Not e2e (verified at backend/integration only)**
- S2 — `mergeTags` writes a log row with exactly correct reassigned counts. Its own UI trigger was
  already e2e-proved by `ontology-split-merge`'s plan; this item's new surface (log-row count
  correctness) is proven more precisely via direct Postgres assertions than DOM text matching.
- S3 — `mergeCurricula` writes a log row with exactly correct reassigned counts (five fields). Same
  reasoning as S2 — `curriculum-merge`'s plan already proved the UI trigger.
- S4 — `mergeDomainNodes` writes a log row with exactly correct reassigned counts, plus the negative
  case (a rejected merge writes zero log rows). Same reasoning as S2/S3 —
  `domain-node-merge`'s plan already proved the UI trigger.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/admin-observability/` (new feature folder — no e2e coverage exists for this
  page today; S1 also composes the existing `features/subject/actions/merge-subject.action.ts`)
- Target DB: `post-anki-e2e` (local Docker Postgres, :5436 — per `project.json`)
- Dev server URL: `http://localhost:3100` (web), API `http://localhost:8031`

## Action surface — snapshot

`features/subject/actions/index.ts` re-exports `createSubject` (EXISTING) and `mergeSubject`/
`openMergePicker` (EXISTING, `merge-subject.action.ts` — drives `MergeSubjectButton`'s confirm-arm
flow via `subject-merge-button-<id>`/`subject-merge-target-select-<id>`/
`subject-merge-confirm-<id>` testids, waits for the source card's removal from the DOM, resolves
both ids via `GET /subjects`). `features/domain-map/actions/create-curriculum-by-name.action.ts`
exports `createCurriculumByName({ page, subjectId, name })` (EXISTING) — plain name-only curriculum
creation, no domain-node attachment, reused directly for S1.

`features/domain-map/seeds/seed-domain-map-fixture.ts` exports `seedAdditionalDomainNode({
subjectId, parentId, name, order? })` (EXISTING) — the callable wrapper over that file's
module-private `insertDomainNode` — the direct precedent for "back-door SQL insert is the correct,
honest way to set up a precondition when no HTTP creation path exists," reused directly for S1's
source domain node.

No `features/admin-observability/` folder exists yet — this plan is the first to need e2e coverage
for that page. This plan's own new seed helper (`insertOntologyMergeLogRow`, S5) follows the same
back-door-when-no-HTTP-path-exists reasoning, since `ontology_merges` rows have no HTTP creation
path independent of triggering a real merge (which S5 deliberately avoids, to keep the read/render
proof independent of any single merge type's write path).

## Scenario → action + state + testid map

### S1 — Merging two subjects via the UI writes a visible, correctly-populated log row

**Composes actions:** `createSubject` ×2 (subject feature, EXISTING), `createCurriculumByName`
(domain-map feature, EXISTING — plain name-only curriculum creation under the source subject, no
domain-node attachment needed for this), `mergeSubject` (subject feature, EXISTING).

**Seed helper reused (back door, not a front-door action):** `seedAdditionalDomainNode({ subjectId:
sourceSubjectId, parentId: null, name: 'S1 Source Domain Node' })` from
`features/domain-map/seeds/seed-domain-map-fixture.ts` (EXISTING, exported) — attaches one domain
node to the source subject so `domainNodesMoved` is non-zero and distinguishable from a trivial 0/0
merge. There is no front-door single-node creation action — confirmed by `domain-node-merge`'s own
plan ("this table has no HTTP creation path independent of the agent-driven placement flow"); using
the seed is the correct, honest way to set up this precondition, not a workaround. (Note:
`insertDomainNode` itself is module-private in that file — `seedAdditionalDomainNode` is the
exported wrapper actually callable from a test.)

**Action gaps:**
- `openAdminObservabilityPage({ page }): Promise<void>` — new,
  `features/admin-observability/actions/open-admin-observability.action.ts`. Navigates to
  `/admin-observability`, waits for hydration and for the "Recent ontology merges" section's
  table to be present in the DOM.
- `readOntologyMergeRows({ page }): Promise<{ entityType: string; targetName: string; sourceName: string; reassignedText: string }[]>`
  — new, same file. Reads every row of the "Recent ontology merges" table back as structured text
  (one object per row, columns as named fields) — used by both S1 (find the one row for this
  merge) and S5 (assert all four rows render correctly).

**Pre-test state:** `baseline-only + back-door node seed` — both subjects and the source's
curriculum are created front-door, in-test, via existing actions; the source's domain node is
back-door seeded (see above, no front-door path exists for it). The merge and the read-back are
front-door.

**Setup role:** the two subjects, the source's curriculum, and the source's domain node = scenery
(preconditions the merge needs to have something real to reassign); the merge operation itself and
the resulting log row = **subject** (front door — this is exactly what the scenario verifies: that
a real merge, triggered the normal way, produces a real, correctly-populated log row visible on the
real page). The test file also runs a direct SQL query (not a Playwright action) to cross-check
`reassigned_counts` against the real post-merge `curricula`/`domain_nodes` row counts — the same
two-layer DOM-plus-SQL pattern `domain-node-merge`'s own S1 established, since `mergeSubjects` has
no separate backend-integration test in this plan to catch a count-correctness bug otherwise.

**Required `data-testid` attributes:**
- `admin-observability-merges-table` — the new section's table (distinguishes it from the two
  existing tables on the same page for the read-back action)
- `admin-observability-merge-row` — one per rendered row
- `admin-observability-merge-entity-type` / `-target-name` / `-source-name` / `-reassigned` —
  per-cell testids inside each row, scoped under `admin-observability-merge-row`

**Fixture variants:** none.

**Vision check candidate:** no (structural DOM text + direct-DB cross-check suffice).

---

### S5 — The admin view renders all four entity types correctly, independent of S1–S4

**Composes actions:** `openAdminObservabilityPage`, `readOntologyMergeRows` (both new, from S1
above).

**Seed helper (new, back door):**
`insertOntologyMergeLogRow({ entityType, targetName, sourceName, reassignedCounts, createdAt }): Promise<void>`
— `features/admin-observability/seeds/seed-ontology-merge-fixture.ts`. Direct SQL insert into
`ontology_merges` with caller-supplied, self-describing `target_id`/`source_id` values (e.g.
`sub_seed_target`/`sub_seed_source` — the ids themselves are never asserted on, only the names and
counts are) and a caller-supplied, explicit `createdAt` (never left to Postgres's `now()` — a shared
transaction across the 4 seed calls would otherwise give them identical timestamps, making any
ordering assertion undefined; each of the 4 calls below passes a distinct value one second apart).
Mirrors `seedAdditionalDomainNode`'s own reasoning exactly: there is no front-door way to produce
all four entity-type shapes without genuinely running four different real merges (which S1–S4
already prove independently) — seeding the row directly is the correct, honest way to isolate "does
the read/render path handle all four shapes" from "does each merge type's write path work."

**Pre-test state:** `baseline-only` for the page itself; four `ontology_merges` rows seeded
back-door, one per entity type, each with a distinct `reassigned_counts` key set (matching each real
merge function's own actual field names, so the test is asserting against the real shape, not an
invented one):
- subject: `{ curriculaMoved: 3, domainNodesMoved: 1 }`
- tag: `{ assignmentsMoved: 2, assignmentsDeduped: 1, sessionsMoved: 1 }`
- curriculum: `{ modulesMoved: 4, topicsMoved: 9, sourcesMoved: 2, socraticSessionsMoved: 1, probeSessionsMoved: 1 }`
- domain_node: `{ curriculaMoved: 1, childNodesMoved: 2 }`

**Setup role:** all four seeded rows = scenery (back-door, precondition data); the page's rendering
of all four = **subject** (front door — this is what the scenario verifies).

**Required `data-testid` attributes:** same as S1, no new ones.

**Fixture variants:** none.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `openAdminObservabilityPage` | S1, S5 | No — single-purpose page-open helper |
| `readOntologyMergeRows` | S1, S5 | No — single-purpose read-back helper |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | baseline-only + back-door node seed | 2 subjects + 1 curriculum created front-door; the source's 1 domain node back-door seeded via `seedAdditionalDomainNode` (no front-door single-node action exists); the merge itself + a direct-SQL count cross-check run in-test |
| S2 (backend-only) | n/a — integration test, not e2e | Two tags + tag_assignments seeded directly via Drizzle insert in the test file |
| S3 (backend-only) | n/a — integration test, not e2e | Two curricula + modules/topics/sources/sessions seeded directly in the test file |
| S4 (backend-only) | n/a — integration test, not e2e | Two domain nodes + curriculum + child node seeded directly in the test file |
| S5 | baseline-only + back-door log-row seed | 4 `ontology_merges` rows seeded directly via new `insertOntologyMergeLogRow` seed helper |

## Open questions

None carried forward — every fork this plan needed had a settled answer before writing
`scenarios.md` (see `spec.md`'s "Decisions made autonomously" and `discussion.md`).
