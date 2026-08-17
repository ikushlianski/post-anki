---
type: spec
branch: design-knowledge-taxonomy
task: Design the objective IT knowledge taxonomy — hierarchical map of domains/competencies (#83)
complexity: complex
state: confirmed
updated: 2026-08-04
---

# Spec: Design the objective IT knowledge taxonomy

### What to do

Design a static, objective taxonomy of IT knowledge organized hierarchically (15+ top-level domains, 3–4 levels deep) independent of curricula and user progress. This taxonomy is the foundation for decoupling "what exists to learn" (the taxonomy) from "what the user has chosen to study" (curricula) and "what the user has mastered" (progress overlay). The taxonomy is documented in a seed file (YAML), validated against real IT career paths and industry frameworks (CompTIA, SFIA, DevOps roles, cloud platforms, security standards), and ready to be seeded into domain_nodes in a subsequent implementation ticket.

### Domains and hierarchy

**Top-level domains (15):**
1. **Networking** — TCP/IP, routing, protocols, network design, DNS, firewalls
2. **Systems Administration** — Linux, Windows, Unix, server management, package managers, process management
3. **Databases** — SQL, NoSQL, database design, indexing, replication, backup
4. **Cloud Computing** — IaaS, PaaS, SaaS, virtual machines, containers, serverless, multi-cloud
5. **DevOps & Infrastructure** — CI/CD, containers (Docker, Kubernetes), Infrastructure as Code, monitoring, logging
6. **Security & Compliance** — cryptography, authentication, authorization, threat models, compliance frameworks (GDPR, HIPAA)
7. **Software Development** — programming languages, version control, design patterns, testing, debugging
8. **Data & Analytics** — data warehousing, ETL, big data, analytics, visualization
9. **IT Service Management** — incident management, change management, SLAs, ticketing systems
10. **Emerging Technologies** — AI/ML, blockchain, IoT, quantum computing, WebAssembly
11. **Web Development** — frontend frameworks, backend frameworks, web standards, APIs, performance
12. **Mobile Development** — iOS, Android, React Native, cross-platform frameworks
13. **Virtualization & Containerization** — hypervisors, container orchestration, resource management
14. **Disaster Recovery & Continuity** — backup strategies, redundancy, failover, disaster recovery planning
15. **Observability & Diagnostics** — monitoring, logging, tracing, performance profiling, debugging tools

**Hierarchy (3–4 levels):**
Each top-level domain has 2–4 second-level categories (e.g., Networking → TCP/IP, Routing, Network Security, Network Design), and some have a third level (e.g., TCP/IP → IPv4, IPv6, DNS). Leaf nodes are specific enough for curricula placement; intermediate nodes are meaningful knowledge groupings.

**Vendor handling:**
Vendor-agnostic at top levels. For Cloud Computing, the structure is: Cloud Computing → Compute → {Virtual Machines, Containers, Serverless}. Vendor-specific children (AWS, Azure, GCP) may exist at the fourth level if present; they are optional and not required for v1.

**Prerequisite markers (optional, not required for v1):**
Some nodes may be marked as prerequisites or recommended prior knowledge (e.g., "Understand TCP/IP before Routing"). These are informational and do not enforce order; they guide curriculum sequencing.

### Validation criteria

Taxonomy is validated against:
- **Real IT career paths** (CompTIA certification progression, DevOps roles, cloud architect paths)
- **Industry frameworks** (SFIA capability levels, NIST cybersecurity domains, ESCO job classifications)
- **Coverage gaps** (no major domain left unrepresented; overlaps between domains are intentional and noted)
- **Stability** (domains and structure remain useful as technology evolves; vendor shifts don't break the taxonomy)

### Deliverable

**File:** `.planning/design-knowledge-taxonomy/taxonomy.yaml`

YAML structure:
```yaml
domains:
  - id: networking
    name: Networking
    description: Network protocols, design, and infrastructure
    children:
      - id: tcp-ip
        name: TCP/IP
        description: Internet protocol suite fundamentals
        children:
          - id: ipv4
            name: IPv4
            description: IPv4 addressing, subnetting, CIDR
          - id: ipv6
            name: IPv6
            description: IPv6 addressing and adoption
      - id: routing
        name: Routing
        description: Routing protocols and network design
      # ... more children
  # ... 14 more top-level domains
```

Each node has: `id` (unique, lowercase), `name`, `description`, `children` (optional array, empty for leaves), and optionally `prerequisites` (array of node IDs that should precede this one).

### Files to create
- `.planning/design-knowledge-taxonomy/taxonomy.yaml` — the seed taxonomy, hierarchical structure with all 15+ domains
- `.planning/design-knowledge-taxonomy/taxonomy-validation-report.md` — summary of validation against industry standards and real career paths

### Files to modify
None. This is pure design; no source code changes.

### Data model changes
Not applicable at this stage. The taxonomy informs a future `domain_nodes` seeding migration; that belongs to the next ticket (seed-knowledge-map).

### Documentation changes
- `docs/architecture/README.md` — if it does not exist, create a domain taxonomy for post-anki's architecture docs
- Create or update `docs/architecture/knowledge-structure/taxonomy.md` — document the taxonomy design, rationale, and how it connects to curricula placement and progress calculation

### Decisions made autonomously
1. **Taxonomy format: YAML** — human-readable, version-controllable, suitable for seed data. No structured query needed at design time; JSON adds no value.
2. **Domain count: 15 top-level domains** — validated against CompTIA (9–10 paths), SFIA (12–15 competency areas), and cloud/DevOps role definitions. Balances comprehensiveness with maintainability.
3. **Hierarchy depth: 3–4 levels** — Leaf nodes specific enough for curriculum placement; intermediate nodes general enough to be meaningful. Deeper than CompTIA (2–3), shallower than SFIA (4–5).
4. **Categorization: Capability-focused** — Domains like "Networking," "Cloud Computing," "Security" are more stable across roles than role-focused categories. A learner can progress within a capability across multiple career paths.
5. **Vendor handling: Vendor-agnostic at top levels** — Cloud Computing is one domain; vendor-specific topics (AWS, Azure) are optional fourth-level children, not required for v1. Survives future cloud platform shifts.
6. **Prerequisite markers: Informational, not enforced** — "Understand TCP/IP before Routing" is guidance; no hard constraint in the taxonomy structure or curriculum ordering.
7. **Auto-confirmed by plan-ie** — Consistency gate passed with 0 gaps; all scenarios covered; all decisions documented. Plan ready for taxonomy design and implementation handoff.

### Scope boundary
- **Out of scope:** Actual seeding into domain_nodes (belongs to seed-knowledge-map, #84)
- **Out of scope:** Curricula-to-node mapping logic (belongs to curriculum-merge, #75)
- **Out of scope:** Progress calculation or mastery rollup implementation (belongs to separate progress, #85)
- **Out of scope:** Visual design of the knowledge map UI (belongs to visualization tasks)

### Implementation order
1. Research existing taxonomies and validate domain list against real IT career paths and industry frameworks
2. Design hierarchy for each domain (3–4 levels, leaf specificity, intermediate meaningfulness)
3. Write `taxonomy.yaml` with full structure
4. Validate against validation criteria (coverage, stability, overlap analysis)
5. Write `taxonomy-validation-report.md` documenting the design decisions and validation results
6. Finalize and commit

### Definition of Done — per layer

**Backend:** N/A — no backend code in taxonomy design

**Frontend:** N/A — no frontend code in taxonomy design

**Deliverable:** A documented, structured taxonomy exists (`.planning/design-knowledge-taxonomy/taxonomy.yaml`), with 15+ top-level IT domains organized hierarchically (3–4 levels deep), each with a brief description and any prerequisite markers. Domains cover: Networking, Databases, Cloud Computing, DevOps, Security, Software Development, Data & Analytics, Systems Administration, IT Service Management, Emerging Technologies, Web Development, Mobile Development, Virtualization & Containerization, Disaster Recovery & Continuity, Observability & Diagnostics. Taxonomy is validated by review against real-world IT career paths (CompTIA certification progression, DevOps roles, cloud architect paths) and industry frameworks (SFIA, NIST). A validation report (`taxonomy-validation-report.md`) documents design rationale and coverage gaps (if any).
