---
type: scenarios
branch: design-knowledge-taxonomy
task: Design the objective IT knowledge taxonomy — hierarchical map of domains/competencies (#83)
state: confirmed
updated: 2026-08-04
---

# Scenarios: Design the objective IT knowledge taxonomy

## Business Scenarios

### SCENARIO 1: Taxonomy seeded into domain_nodes, structure verified

A future implementation (seed-knowledge-map) takes this designed taxonomy and seeds it into the domain_nodes table. All 15+ top-level domains exist as rows, with hierarchical parent_id references. Each node has a description and, where applicable, prerequisite markers. No curricula are yet attached; the structure is pure taxonomy.

**What to verify:**
- All 15+ top-level domains are present in domain_nodes
- Hierarchy is correctly represented (parent_id references form a tree, no cycles)
- Each domain has 2–4 second-level children; some children have a third level
- Leaf nodes are specific enough to receive curriculum attachments
- Intermediate nodes are meaningful knowledge groupings, not just containers
- Prerequisites (if present) are acyclic and resolvable
- No orphaned nodes; the tree is complete and traversable

### SCENARIO 2: Curricula placed under taxonomy nodes

When a user creates a curriculum or a system imports one, it can be placed under an existing taxonomy node (e.g., "Docker Deep Dive" → DevOps & Infrastructure → Containers → Docker). The taxonomy does not change; curricula are attached to existing nodes. Placement is explicit (user selects a node) or inferred (curriculum name matches an existing node or is close enough for a recommendation).

**What to verify:**
- Curricula can be attached to any node (leaf or intermediate)
- Multiple curricula can attach to the same node
- Taxonomy nodes are not created dynamically by curricula; the structure is fixed
- Placement does not modify parent_id or node hierarchy
- A curriculum detached from one node can be reattached to another without data loss

### SCENARIO 3: Knowledge map shows complete taxonomy, mastery as overlay

The domain map UI displays every node in the taxonomy, even those with no attached curricula and no studied topics. For nodes with attached curricula, mastery percentage rolls up from all included topics. For empty nodes (no curricula, no topics), the UI displays 0%, not an absence or hidden state. The map reflects the objective structure; mastery is an overlay.

**What to verify:**
- All nodes (even empty ones) are rendered in the map
- Nodes with 0% mastery are visible, not filtered out or greyed invisible
- Mastery aggregation includes all curricula anywhere in the subtree (not just direct children)
- A curriculum moved from one node to another updates mastery for both old and new parents
- The taxonomy structure does not change based on curriculum activity or user progress

### SCENARIO 4: Taxonomy is stable across technology evolution

A curriculum for "AWS Lambda" fits under Cloud Computing → Serverless → AWS (or just Cloud Computing → Serverless if no vendor level). If a new platform (e.g., Google Cloud Functions, Azure Functions) emerges, both fit under the same Serverless node. The taxonomy does not fragment per vendor or per quarterly tech trend. A domain node can accommodate multiple implementations of the same capability.

**What to verify:**
- Vendor-specific topics (AWS, Azure, GCP) nest under capability-level nodes, not alongside them
- Adding a new vendor does not require restructuring the taxonomy
- Emerging technologies (AI/ML, blockchain) have designated homes and do not proliferate as top-level domains
- Hierarchy depth is consistent, not varying per domain (all roughly 3–4 levels, not some 2 and others 5+)

### SCENARIO 5: Taxonomy reflects real IT career paths

An IT career typically starts with Systems Administration or Networking fundamentals, progresses through specialization (e.g., Cloud Computing, Security), and optionally reaches architecture or leadership. A learner following a real career path (e.g., System Admin → DevOps → Cloud Architect) finds those domains and a coherent progression through the taxonomy.

**What to verify:**
- Real career prerequisite chains are represented (e.g., Networking before Routing, TCP/IP before DNS)
- A learner can traverse the taxonomy following a believable role progression
- Domains align with published certifications (CompTIA A+, Network+, Security+, Cloud+; AWS Solutions Architect, etc.)
- No major IT domain is missing or under-represented
- The taxonomy accommodates both specialist and generalist learning paths
