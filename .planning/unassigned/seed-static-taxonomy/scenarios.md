---
type: scenarios
branch: decouple-curricula-from-domain-nodes
task: "Seed the initial static taxonomy into the database (#82 follow-up)"
state: confirmed
updated: 2026-08-04
---

# Scenarios: Seed the initial static taxonomy into the database

## Business Scenarios

None — this is an internal data-seeding mechanism with no direct end-user-facing behavior. The
taxonomy only becomes visible to a user once a subject is deliberately pointed at it, which is
gated on the still-open subject-placement decision (issue #84, Decision #2 — see spec.md's
"Decisions made autonomously"). See Technical/Architectural Scenarios below for what this ticket
actually proves.

## Technical/Architectural Scenarios

SCENARIO 1: The full 208-node taxonomy seeds correctly into an empty subject

Given a subject with no existing domain nodes, running the seed script against the real
`taxonomy.yaml` (15 top-level domains, 208 nodes total, 3 levels deep) creates exactly 208
`domain_nodes` rows: 15 with `parent_id IS NULL`, every row's `source` set to `"static_taxonomy"`,
and the parent/child structure matching the YAML's nesting exactly.

What to verify:
- Row count after seeding equals 208
- Exactly 15 rows have `parent_id IS NULL`
- Every seeded row's `source` column is `"static_taxonomy"`
- Every non-root row's `parent_id` resolves to another seeded row in the same subject (no
  orphans) and walking up from any leaf reaches a null-parent root within 3 hops (no cycles)

SCENARIO 2: Re-running the seed script is idempotent

Given a subject already fully seeded with the taxonomy, running the seed script a second time
creates zero new rows and reports every node as skipped.

What to verify:
- First run: `created: 208, skipped: 0`
- Second run against the same subject: `created: 0, skipped: 208`
- Total row count after both runs is still 208 — no duplicates

SCENARIO 3: No curricula are mapped to the newly seeded nodes

Given a freshly seeded taxonomy AND a curriculum that already has a confirmed mapping to some
OTHER, pre-existing node in the same database (so the assertion below has something real to
catch, not an empty table it would pass against trivially), no row in
`curriculum_domain_node_mappings` references any of the newly created domain node ids.

What to verify:
- `SELECT count(*) FROM curriculum_domain_node_mappings WHERE domain_node_id IN (<the 208 newly
  seeded ids specifically>)` returns 0 immediately after seeding, even though the mappings table
  itself is non-empty (it has a row pointing at a different, pre-existing node) — proving the
  check is actually discriminating, not vacuous
- Red-team review confirmed the seed script never writes to `curriculum_domain_node_mappings` at
  all (it only inserts into `domain_nodes`), so this is guaranteed by construction today — the
  test exists to lock that in as a regression guard, not because it's currently in doubt

SCENARIO 4: A taxonomy with duplicate sibling names is rejected loudly

Given a YAML document where two children under the same parent share the same `name`, parsing it
throws a descriptive error instead of silently seeding one node for both entries.

What to verify:
- `parseTaxonomyYaml` throws with a message naming the duplicate and its parent, rather than
  returning a `SeedNode[]` that would silently collide under the existing
  `(subjectId, parentId, name)` idempotency key
- The real `taxonomy.yaml` shipped by #83 passes this check today (verified during planning: zero
  duplicate sibling names anywhere in the 208-node tree)

SCENARIO 5: Seeding against a subject that doesn't exist still fails loudly

Given a subject id with no matching row in `subjects`, running the seed script throws before
inserting anything — unchanged pre-existing behavior from #84's version of this script, re-verified
now that the data source is the real YAML file instead of the in-file placeholder.

What to verify:
- No `domain_nodes` rows are inserted
- The thrown error names the missing subject id

SCENARIO 6: Pre-existing domain nodes in other subjects are left untouched

Given a database that already has domain nodes from the old dynamic-creation flow (`source:
"ai_generated"`) or from #84's earlier placeholder taxonomy run (`source: "static_taxonomy"`,
4 domains, 16 nodes, seeded under a different subject), seeding the real 208-node taxonomy into a
different subject never reads, modifies, or deletes any of those pre-existing rows.

What to verify:
- Row count and content for every subject other than the one being seeded is unchanged before and
  after the run
- Reconciling those pre-existing legacy nodes into the new static taxonomy is explicitly out of
  scope here (matches #84 Decision #4's own scope boundary — that reconciliation is a follow-on
  step, not this ticket's job)

SCENARIO 7: Re-seeding a subject that already holds the old placeholder tree forms two disjoint
forests, not a merge

Given a subject that already has #84's small placeholder taxonomy seeded (4 top-level domains, 16
nodes, `source: "static_taxonomy"`), running the real 208-node seed script against that SAME
subject adds the full real tree alongside the placeholder rather than merging into it — the two
never collide by name because their top-level domain names are completely disjoint (verified
during planning/red-team review: zero overlap between the real taxonomy's 15 domain names and the
placeholder's 4).

What to verify:
- Total row count after the run is 224 (16 placeholder + 208 real)
- 19 rows have `parent_id IS NULL` (4 placeholder roots + 15 real roots)
- The original 16 placeholder rows (id, name, description, parent_id) are byte-for-byte unchanged
- This scenario documents a real coexistence risk, not a fix — resolving which forest a subject
  should actually hold is out of scope (issue #84 Decision #2)
