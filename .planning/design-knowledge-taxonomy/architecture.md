---
type: architecture
branch: design-knowledge-taxonomy
task: Design the objective IT knowledge taxonomy — hierarchical map of domains/competencies (#83)
state: confirmed
updated: 2026-08-04
---

# Architecture: Design the objective IT knowledge taxonomy

## What changes structurally

This is a pure design phase — no backend, frontend, or infrastructure code changes occur here. The output is a documented taxonomy (YAML file) that becomes the input for future implementation tickets (#84 seed-knowledge-map, #75 curriculum-merge, #85 separate progress).

**Current state:** Domain nodes are created dynamically whenever a curriculum is added, mixing "what the user chose to study" with "what exists to learn."

**Proposed state:** A static, objective taxonomy of IT knowledge exists independently of any curriculum or user progress. The taxonomy is seeded into domain_nodes in a subsequent ticket. Curricula are then attached to existing taxonomy nodes (not creating new ones). Mastery is calculated as an overlay on top of the taxonomy, not as the primary structure.

### Data model implications (future implementation, not in this ticket)

The taxonomy design anticipates the following data model:

**Current domain_nodes table (no changes in this ticket):**
```
domain_nodes
  id             text primary key
  subject_id     text not null
  parent_id      text                -- nullable self-ref
  name           text not null
  description    text
  order          integer not null default 0
  created_at     timestamp not null default now()
```

**Future change (in seed-knowledge-map, #84):**
- A one-time migration will seed all taxonomy nodes into domain_nodes, one row per node, with parent_id pointers forming the hierarchical tree.
- No dynamic node creation on curriculum add; curricula attach to existing nodes.

**Future change (in curriculum-merge, #75):**
- curricula table gains optional `domain_node_id` (nullable, existing rows remain null).
- When a curriculum is created, the orchestrator queries domain_nodes for a matching node and attaches the curriculum.

**Future change (in separate progress, #85):**
- Mastery calculation (domainNodeProgress) aggregates all topics in all curricula anywhere in a node's subtree.
- A node with zero curricula/topics displays 0%, reflecting the objective taxonomy structure.

### Boundaries and ownership

**Taxonomy design (this ticket):**
- Identifies 15+ domains and their hierarchical structure.
- Validates against industry frameworks and real career paths.
- Documents rationale and design decisions.
- Output: taxonomy.yaml and validation report.

**Taxonomy seeding (#84, seed-knowledge-map):**
- Migrates taxonomy.yaml → domain_nodes rows.
- Verifies integrity and traversability.
- Handles any necessary subject-level instantiation.

**Curriculum placement logic (#75, curriculum-merge):**
- Implements the placement orchestrator (explicit user selection, name matching, agent-assisted suggestion).
- Wires curricula to domain nodes.

**Progress overlay (#85, separate progress):**
- Implements mastery rollup on the taxonomy.
- Decouples progress visualization from structure.

### No architectural shifts in this ticket

No new services, no new async boundaries, no infrastructure changes, no cross-service boundaries. The taxonomy is a data artifact (a YAML file) that informs the schema of a table seeded in a future ticket. Planning and design only — implementation deferred.

## Failure modes

### Design-level failures (prevention via validation)

**Incomplete coverage:** A domain is left out (e.g., "DevOps" missing, forcing it to be shoehorned into "Systems Administration"). **Prevention:** Validate against CompTIA, SFIA, and published role definitions; list any gaps explicitly in the validation report.

**Hierarchy is too deep or too shallow:** A domain has 6+ levels (hard to navigate) or only 1 (too generic to attach curricula). **Prevention:** Define and enforce a 3–4 level target; validate each domain during taxonomy design.

**Vendor lock-in:** The taxonomy is structured around AWS, Azure, or GCP, making it brittle if a learner uses different platforms. **Prevention:** Capability-focused structure (Cloud Computing, not AWS) with optional vendor-specific children.

**Overlapping domains:** "Cloud Computing" and "Virtualization & Containerization" have unclear boundaries. **Prevention:** Clear, non-overlapping definitions for each domain; document the distinction in the validation report.

### Future runtime failures (once seeded, addressed in later tickets)

**Cycles in the parent_id graph:** A node points to itself or forms a cycle. **Prevention:** Integrity check during migration; traversal algorithm includes cycle detection.

**Orphaned nodes:** A node with parent_id pointing to a non-existent parent. **Prevention:** Foreign key or app-level validation during migration.

**Empty taxonomy:** Migration fails and no nodes are seeded. **Prevention:** Validation and rollback logic in the migration; comprehensive test coverage.

## Rollout

**Phase 1 — This ticket (design-knowledge-taxonomy):**
- Research and validate domains against industry standards.
- Design hierarchy for each domain.
- Write taxonomy.yaml and validation report.
- Commit to .planning/design-knowledge-taxonomy/.

**Phase 2 — seed-knowledge-map (#84):**
- Generate and run migration to seed domain_nodes.
- Verify tree structure is traversable and complete.

**Phase 3 — curriculum-merge (#75) and separate progress (#85):**
- Wire curricula to domain nodes.
- Implement mastery rollup on taxonomy.
- Deploy knowledge map UI.

No backward incompatibility issues; existing curricula remain unattached to the taxonomy until explicitly placed.
