---
type: spec
branch: decouple-curricula-from-domain-nodes
task: "Seed the initial static taxonomy into the database (#82 follow-up)"
complexity: medium
state: confirmed
updated: 2026-08-04
---

# Spec: Seed the initial static taxonomy into the database

### What to do

Wire the existing `seed-domain-taxonomy.ts` script (built during #84) to load and seed the REAL
208-node, 15-domain taxonomy from `.planning/design-knowledge-taxonomy/taxonomy.yaml` (#83's
output), instead of the small 4-domain/16-node placeholder hierarchy currently hardcoded in the
script. Prove the mechanism correct — idempotent, structurally sound, and touching nothing it
shouldn't — against a real, freshly-migrated throwaway Postgres database, AND actually seed it,
for real and persistently, into a clearly-provisional local-dev-only subject. Placement of the
real taxonomy into a specific production-visible subject stays deliberately out of this ticket's
scope; see "Decisions made autonomously" below for why.

### Single phase — backend only

One vertical slice: static data file → pure parser (deriver) → existing seed script rewired to use
it → npm script wiring → integration test proving all seven scenarios against a throwaway
database → one real, persistent seed run against the local dev database.

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `parseTaxonomyYaml` (`apps/api/src/domain-map/parse-taxonomy-yaml.ts`) | `yamlText: string` (the raw contents of `it-taxonomy.yaml`) | `SeedNode[]` — the same `{ name, description?, children? }` shape `seed-domain-taxonomy.ts` already consumes; `id` and `prerequisites` fields from the source YAML are dropped (domain_nodes has no column for either — matches #83's own architecture.md, which calls prerequisites "informational, not enforced" with no schema support). Throws if two children under the same parent share a `name`. | SCENARIO 1, 4 |

**Verified during red-team review, not assumed:** `apps/api/vitest.config.ts`'s `include` is
`["src/**/*.test.ts"]` only — a `*.test.ts` file under `apps/api/scripts/` is invisible to both
`npm run test` and `npm run test:integration` (the same fact `seed-domain-nodes.integration.test.ts`'s
own comment already documents, confirmed empirically there). `parseTaxonomyYaml` and its test
therefore live under `apps/api/src/domain-map/`, not `apps/api/scripts/seed-data/` — matching
`seed-domain-taxonomy.integration.test.ts`'s own precedent exactly — and `seed-domain-taxonomy.ts`
(which stays in `scripts/`) imports it via relative path, the same way it already imports
`domainNodes`/`subjects` from `../src/db/schema.js`.

No other derivers are touched. `seedNode`/`seedDomainTaxonomy` in `seed-domain-taxonomy.ts` stay
async, DB-touching functions (Layer 2/3 — controller/side-effect), unchanged in shape from #84;
only their data source changes.

### Files by scenario

| Scenario | Backend files | Frontend files | Infrastructure files |
|----------|---------------|-----------------|------------------------|
| SCENARIO 1 (full taxonomy seeds) | `apps/api/scripts/seed-data/it-taxonomy.yaml`, `apps/api/src/domain-map/parse-taxonomy-yaml.ts`, `apps/api/scripts/seed-domain-taxonomy.ts`, `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |
| SCENARIO 2 (idempotent re-run) | `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |
| SCENARIO 3 (no curricula mapped) | `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |
| SCENARIO 4 (duplicate-name rejection) | `apps/api/src/domain-map/parse-taxonomy-yaml.ts`, `apps/api/src/domain-map/parse-taxonomy-yaml.test.ts` | None | None |
| SCENARIO 5 (missing subject fails loudly) | `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |
| SCENARIO 6 (pre-existing nodes untouched) | `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |
| SCENARIO 7 (same-subject re-seed over the old placeholder forms two disjoint trees) | `apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts` | None | None |

### Files to create

```
apps/api/scripts/seed-data/
  it-taxonomy.yaml                 — copy of .planning/design-knowledge-taxonomy/taxonomy.yaml's
                                      content (208 nodes, 15 domains, 3 levels — verified during
                                      planning). Copied because this exact file does not exist
                                      anywhere in THIS worktree today (see "Files to modify" note
                                      below) and because .planning/ is a planning-artifact
                                      location, not a runtime data location this repo's scripts
                                      read from anywhere else (grep found zero precedent) — the
                                      seed script needs its own source-controlled copy, co-located
                                      with the script that consumes it, same as every other seed
                                      script's data living next to the script itself. Only a data
                                      file, not a test — fine to live under scripts/ (see the note
                                      on parse-taxonomy-yaml.ts below for why the .ts files can't).

apps/api/src/domain-map/
  parse-taxonomy-yaml.ts           — parseTaxonomyYaml deriver (see Derivers table). Lives here,
                                      NOT under apps/api/scripts/, because apps/api/vitest.config.ts's
                                      include glob (src/**/*.test.ts only) would make a test file
                                      under scripts/ invisible to both `npm run test` and
                                      `npm run test:integration` — verified directly against the
                                      current file during red-team review, same fact
                                      seed-domain-nodes.integration.test.ts's own comment already
                                      documents. seed-domain-taxonomy.ts (which stays in scripts/)
                                      imports this by relative path, same as it already imports
                                      domainNodes/subjects from ../src/db/schema.js.
  parse-taxonomy-yaml.test.ts      — unit tests: full structure parses, id/prerequisites dropped,
                                      duplicate-sibling-name rejection (SCENARIO 1, 4)
  seed-domain-taxonomy.integration.test.ts — mirrors seed-domain-nodes.integration.test.ts's exact
                                      pattern: fresh throwaway Postgres database per test (created
                                      + migrated + dropped via the same createMigratedTestDb/
                                      dropTestDb helpers), a throwaway subject created inside it,
                                      never the shared local dev database. Proves SCENARIO 1, 2, 3,
                                      5, 6, 7 end-to-end with real SQL. Same discoverability reason
                                      as parse-taxonomy-yaml.ts above.
```

### Files to modify

```
apps/api/scripts/seed-domain-taxonomy.ts  — delete the hardcoded TAXONOMY_HIERARCHY constant;
                                             read apps/api/scripts/seed-data/it-taxonomy.yaml from
                                             disk and pass its contents through parseTaxonomyYaml
                                             to get the SeedNode[] the existing seedNode/
                                             seedDomainTaxonomy functions already consume
                                             unchanged. CLI usage (subjectId as argv[2]) is
                                             unchanged from #84.
apps/api/package.json                     — add "yaml" as a direct dependency (already resolves
                                             transitively at 2.9.0 today — promoting it to direct
                                             is the only change, no new transitive footprint); add
                                             "db:seed:domain-taxonomy" script, matching
                                             "db:seed:subjects"'s exact shape
package.json (root)                       — forward "db:seed:domain-taxonomy" to the workspace,
                                             matching "db:seed:subjects"'s exact forwarding line
```

**Note on `it-taxonomy.yaml`'s source — the ONE authoritative copy, and where it is NOT:** the
file being copied (`.planning/design-knowledge-taxonomy/taxonomy.yaml`) exists in exactly one
place: as an uncommitted file in the **main repo checkout**
(`/Users/ikushlianski/webdata/ilya-projects/post-anki/.planning/design-knowledge-taxonomy/
taxonomy.yaml`) — that is the authoritative copy. A sibling worktree named `design-knowledge-
taxonomy` also exists (`git worktree list`) but its working tree is clean/empty for this path
(confirmed via `find`/`git status` there during planning) — despite the name, #83's actual work
was done directly in the main checkout, not in that worktree, so it holds no second copy to
reconcile against. The file is **not present anywhere in THIS worktree**
(`decouple-curricula-from-domain-nodes`) either. Implementation must copy the main checkout's
actual content in, not assume it's reachable via a relative path from here, and not assume the
`design-knowledge-taxonomy` worktree has anything to offer.

### Data model changes

None. `domain_nodes.source = "static_taxonomy"` already exists (added by #84's migration, already
applied to the local dev database — confirmed via direct query during planning). This ticket adds
no columns, no migration.

### Documentation changes

No documentation changes required. No architectural shift (no new service, no new async boundary,
no infrastructure change) — this ticket wires an existing script to a data source. The taxonomy's
own design rationale is already documented by #83 in `.planning/design-knowledge-taxonomy/
architecture.md` and `taxonomy-validation-report.md`.

### Decisions made autonomously

1. **Subject placement for the real taxonomy in PRODUCTION stays unresolved — by design, not by
   omission. Placement in LOCAL DEV, for real, is this ticket's actual deliverable.** Ran this
   exact question through `fork-classifier-factory`: "which subject receives the real taxonomy"
   is the same Decision #2 already queued on GitHub issue #84 (`needs:decision` label, posted
   2026-08-03T23:43:46Z, zero replies as of this planning run). Classifier verdict: `genuine-fork`
   (irreversible-in-intent, changes unspecified business behavior, no safe reversible default).
   Single-flight guard applied: issue #84 already carries `needs:decision` for this exact fork, so
   no new GitHub action was taken — it's already queued for Ilya.

   **What this actually blocks, precisely:** creating or naming a subject in the app the deployed,
   real user would ever see — post-anki's production deployment runs on GCP, entirely separate
   infrastructure from anything this ticket touches. **What it does NOT block:** seeding the local
   development database (`postanki_dev`, `localhost:5437`, the docker container this whole
   worktree's tests already run against). That database's existing subjects ("Webdev", "Gap Badge
   Demo Subject", "English Phrase Bank Test") are already scratch/test fixtures — none of them
   appear in `seed-subjects.ts`'s own `SEED_SUBJECTS` list, confirming they're not treated as real
   user data even by this repo's own conventions. `hasOutwardFacingSideEffects` was scored `false`
   for this exact reason during the fork-classifier run.

   **Consequence for this ticket:** the shipped seed script stays parameterized by subject id,
   exactly as #84 built it (no hardcoded production subject). Implementation creates ONE new
   subject in `postanki_dev` specifically for this taxonomy — named `"IT Taxonomy (local dev
   seed)"`, a name that deliberately does not presume issue #84's eventual answer — seeds the real
   208-node taxonomy into it for real, and **leaves the rows in place** (not a throwaway run).
   This is what makes the ticket's own "Done when — the taxonomy is seeded into domain_nodes"
   literally true, not merely proven-in-a-test. A dropped-afterward throwaway-database run would
   satisfy "the mechanism works" but not "is seeded" as stated — caught during a second review
   pass after this plan's first draft treated proof-of-mechanism as sufficient on its own.
   Whether/how that data later gets renamed, merged, or pointed at by real curricula once issue
   #84 resolves is explicitly not this ticket's decision.

   **How the subject gets created matters, not just that it does:** a direct, one-off SQL `INSERT
   INTO subjects (...)` against `postanki_dev` only — never adding `"IT Taxonomy (local dev
   seed)"` to `seed-subjects.ts`'s `SEED_SUBJECTS` list. That list is this repo's actual
   production seed data (every entry in it is a subject the real deployed app creates on a fresh
   database); adding this provisional name there would silently pre-decide issue #84 Decision #2
   the moment `db:seed:subjects` next runs against production — exactly the outcome this whole
   deferral exists to avoid. Caught in a second red-team pass: the plan named the destination
   subject but not the mechanism for creating it, leaving the door open to the one mechanism that
   would have quietly resolved the fork.

   The throwaway-database integration test (see "Files to create") still exists, for a different
   purpose: it's the automated regression/idempotency guard that runs on every future change to
   this script, independent of whatever the one-time local-dev seed run above does.
2. **`it-taxonomy.yaml` lives under `apps/api/scripts/seed-data/`**, not read from `.planning/` at
   runtime. Reversible, low-stakes, no existing precedent points the other way (grepped — zero
   runtime code reads from `.planning/` anywhere in this repo today; every match was a code
   comment citing a scenario file for humans).
3. **`yaml` (npm package) promoted to a direct dependency** of `apps/api`. Already resolves
   transitively at `2.9.0` — an actively maintained, widely used library (no hand-rolled YAML
   parser), consistent with CLAUDE.md's "search for an established library first" rule.
4. **`parseTaxonomyYaml` extracted as a standalone, unit-tested pure function** rather than inlined
   into `seed-domain-taxonomy.ts`'s existing recursive walk — the 208-node scale and the
   duplicate-sibling-name failure mode (SCENARIO 4) are real correctness risks worth a dedicated,
   business-language-tested function, not an ad hoc inline transform.
5. **Pre-existing legacy domain nodes (the old dynamic-creation flow's `ai_generated` rows, and
   #84's own already-seeded 16-node placeholder tree under the local dev database's "Webdev"
   subject) are left untouched.** Matches #84 Decision #4's own scope boundary exactly
   (reconciling legacy nodes into the new taxonomy is an explicit follow-on step, not this
   ticket's job) — confirmed via direct query during planning that this placeholder data already
   exists in the shared local dev database with zero curriculum mappings against it, so leaving it
   alone orphans nothing **today**. Caught in red-team review: this is a snapshot, not a guarantee
   — `resolveDomainNodeSource` (`packages/core/src/curriculum-domain-mapping/resolve-domain-node-
   source.ts`) already treats Webdev as `"static_taxonomy"`-sourced because those 16 placeholder
   rows exist, so Webdev is already on the AI-mapping placement path independent of this ticket.
   If a curriculum gets created under Webdev before issue #84's Decision #2 resolves,
   `curriculum_domain_node_mappings` stops being empty for that subject, and whatever
   reconciliation eventually happens (#84 Decision #4) will need to account for it. This ticket
   doesn't cause that risk and isn't the place to fix it, but it's a live possibility, not a
   theoretical one.
6. **Re-seeding the SAME subject that already holds the 16-node placeholder tree produces two
   disjoint forests, not a merge.** Verified during red-team review: the real taxonomy's 15
   top-level domain names (Networking, Databases, Cloud Computing, …) never collide with the
   placeholder's 4 (Frontend, Backend, Cloud & DevOps, Architecture & Patterns), so the existing
   `(subjectId, parentId, name)` idempotency check would never mistake one tree's nodes for the
   other's — but it also means running the real seed against Webdev would leave 224 rows split
   into two `source: "static_taxonomy"` forests with no way to distinguish "the real taxonomy"
   from "the old placeholder" by `source` alone. Not this ticket's problem to solve (which subject
   gets the real taxonomy is Decision #2, still open) but real enough to need its own scenario —
   see SCENARIO 7.

### BAML test coverage

Not applicable — no BAML functions touched.

### Implementation order

1. `parseTaxonomyYaml` — red-green-refactor, covers SCENARIO 1, 4
2. Copy `taxonomy.yaml`'s content (from the main checkout — see the note above) into
   `apps/api/scripts/seed-data/it-taxonomy.yaml`
3. Rewrite `seed-domain-taxonomy.ts` to read the YAML file and call `parseTaxonomyYaml`, dropping
   `TAXONOMY_HIERARCHY`
4. Add `yaml` dependency + `db:seed:domain-taxonomy` npm scripts (root + `apps/api`) — run
   `npm install` in THIS worktree afterward (worktrees don't share `node_modules`; see "Manual
   steps" in todo.md)
5. `seed-domain-taxonomy.integration.test.ts` — covers SCENARIO 1, 2, 3, 5, 6, 7, against a
   throwaway database
6. Create the `"IT Taxonomy (local dev seed)"` subject in `postanki_dev` via a direct, one-off
   SQL `INSERT` (never via `seed-subjects.ts` — see Decision #1) and run `npm run
   db:seed:domain-taxonomy -w @post-anki/api -- <that subject's id>` for real, leaving the rows in
   place — this is what satisfies "Done when" literally (see Decision #1)

### Definition of Done — per layer

**Backend — mechanism proof (throwaway database, regression guard):** Run `npx vitest run --config
apps/api/vitest.config.ts apps/api/src/domain-map/parse-taxonomy-yaml.test.ts` (scoped to
`apps/api`'s own config, same as the integration command below — a bare `npx vitest run <path>`
from repo root does not reliably pick up `apps/api/vitest.config.ts`) — all cases green, including
the duplicate-sibling-name rejection. Run `npx vitest run --config
apps/api/vitest.integration.config.ts apps/api/src/domain-map/seed-domain-taxonomy.integration.test.ts`
against a real, freshly-migrated throwaway Postgres database (not the shared dev/e2e database) and
observe, via actual SQL queries run inside the test, all of:
- `SELECT count(*) FROM domain_nodes WHERE subject_id = $1` → **208**
- `SELECT count(*) FROM domain_nodes WHERE subject_id = $1 AND parent_id IS NULL` → **15**
- `SELECT count(*) FROM domain_nodes WHERE subject_id = $1 AND source <> 'static_taxonomy'` → **0**
- Every non-root row's `parent_id` resolves to another row for the same `subject_id`, and walking
  the tree from every leaf to its root terminates within 2 hops (the real taxonomy is 3 levels
  deep — root, category, leaf — so leaf-to-root is at most 2 parent hops; caught in red-team
  review that "3 hops" would silently tolerate an undetected 4th level) — no orphans, no cycles
- Running the seed function a second time against the same subject: `{ created: 0, skipped: 208 }`,
  and the row count query above still returns 208 (no duplicates)
- With a curriculum row inserted and confirmed-mapped to a DIFFERENT, pre-existing node (never one
  of the 208 newly-seeded ones) in the same throwaway database BEFORE the seed runs — so
  `curriculum_domain_node_mappings` is non-empty and the assertion below has something real to
  fail against, not an empty table it would pass trivially (a red-team finding) — the filtered
  count `SELECT count(*) FROM curriculum_domain_node_mappings WHERE domain_node_id IN (<only the
  208 newly-seeded ids>)` still returns **0**, even though `SELECT count(*) FROM
  curriculum_domain_node_mappings` unfiltered returns **1**
- Seeding a second, unrelated subject's pre-existing nodes (both `ai_generated`-sourced and a
  second `static_taxonomy`-sourced tree) is unaffected — row counts for that subject before and
  after the target subject's seed run are identical
- Seeding the real taxonomy into a subject that ALREADY has the old 16-node placeholder tree
  (`source: "static_taxonomy"`, 4 roots) produces 224 total rows and 19 `parent_id IS NULL` roots
  — the two trees coexist as disjoint forests (verified during red-team review: the real
  taxonomy's 15 root names never collide with the placeholder's 4) — and the original 16
  placeholder rows are byte-for-byte unchanged (SCENARIO 7)

**Backend — the actual deliverable (persistent, local dev database, not dropped):** create a
`"IT Taxonomy (local dev seed)"` subject in `postanki_dev` (`localhost:5437`) via a direct, one-off
SQL `INSERT` — never via `seed-subjects.ts`'s `SEED_SUBJECTS` list, which is production seed data
(see Decision #1) — run `npm run db:seed:domain-taxonomy -w @post-anki/api -- <that subject's
id>`, and query that SAME persistent database afterward (not a throwaway one) to confirm:
- `SELECT count(*) FROM domain_nodes WHERE subject_id = $1` → **208**, `parent_id IS NULL` count →
  **15**, all rows `source = 'static_taxonomy'`
- `SELECT count(*) FROM curriculum_domain_node_mappings WHERE domain_node_id IN (SELECT id FROM
  domain_nodes WHERE subject_id = $1)` → **0**
- The pre-existing "Webdev" (16 rows) and "Gap Badge Demo Subject" (1 row) data is untouched by
  this run — different subject id entirely
- The rows are left in the database after this DoD check runs — this is what makes "Done when —
  the taxonomy is seeded into domain_nodes" true in fact, not only proven reproducible in a test
  that then drops its database (see Decision #1)

**Frontend:** N/A — no frontend code touched.

**Infrastructure:** N/A — no new infrastructure, no migration. `npm run db:seed:domain-taxonomy -w
@post-anki/api -- <subjectId>` exists as a runnable command (confirmed by invoking `--help`-style
argument-validation path: running it with no `subjectId` throws the existing "usage:" error
unchanged from #84).

### Scope boundary

- **Out of scope:** deciding or acting on which subject receives the taxonomy in **production** —
  that's issue #84 Decision #2, still open. (In scope: creating a clearly-provisional, local-dev-
  only subject to hold the real seeded data — see Decision #1 for why that's a different action.)
- **Out of scope:** reconciling pre-existing `ai_generated` domain nodes or #84's own placeholder
  `static_taxonomy` tree into the real taxonomy — that's issue #84 Decision #4, an explicit
  follow-on step
- **Out of scope:** the curriculum-to-taxonomy AI mapping flow (#84's own orchestrator/agent work)
  and the visual knowledge map (#86) — both already built elsewhere in this worktree, neither
  touched by this ticket
- **Out of scope:** any change to `taxonomy.yaml`'s own content — that's #83's finished, confirmed
  output; this ticket only wires it in
