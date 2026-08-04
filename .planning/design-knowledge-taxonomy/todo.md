---
type: todo
branch: design-knowledge-taxonomy
task: Design the objective IT knowledge taxonomy — hierarchical map of domains/competencies (#83)
state: confirmed
updated: 2026-08-04
---

# TODO: Design the objective IT knowledge taxonomy

## Coding tasks

### 1. Research and validate domains against industry standards

- [ ] Review CompTIA certification paths (A+, Network+, Security+, Cloud+, CySA+, PenTest+)
- [ ] Cross-reference SFIA competency areas and capability levels
- [ ] Research DevOps role definitions and career progression (DORA, Linux Academy, cloud platforms)
- [ ] Validate against NIST cybersecurity framework functions
- [ ] Check ESCO job classification (EU standard) for IT role coverage
- [ ] Identify gaps or overlaps between candidate domains

### 2. Design hierarchy for each domain (3–4 levels)

- [ ] Networking: TCP/IP (IPv4, IPv6), Routing, Network Security, Network Design, DNS, Firewalls
- [ ] Systems Administration: Linux, Windows, Unix, Package Managers, Process Management, User Management
- [ ] Databases: SQL, NoSQL, Database Design, Indexing, Replication, Backup, Performance Tuning
- [ ] Cloud Computing: Compute (VMs, Containers, Serverless), Storage, Networking, Managed Services
- [ ] DevOps & Infrastructure: CI/CD, Containers (Docker, Kubernetes), Infrastructure as Code (Terraform, Ansible), Monitoring, Logging
- [ ] Security & Compliance: Cryptography, Authentication & Authorization, Threat Modeling, Compliance (GDPR, HIPAA), Incident Response
- [ ] Software Development: Programming Languages, Version Control, Design Patterns, Testing, Debugging
- [ ] Data & Analytics: Data Warehousing, ETL, Big Data, Analytics, Visualization, Data Governance
- [ ] IT Service Management: Incident Management, Change Management, SLAs, Asset Management, Ticketing
- [ ] Emerging Technologies: AI/ML, Blockchain, IoT, Quantum Computing, WebAssembly
- [ ] Web Development: Frontend Frameworks, Backend Frameworks, Web Standards (HTML/CSS/JS), APIs (REST, GraphQL), Performance
- [ ] Mobile Development: iOS, Android, React Native, Cross-platform Frameworks, Mobile Security
- [ ] Virtualization & Containerization: Hypervisors (KVM, Hyper-V, ESXi), Container Engines, Orchestration, Resource Management
- [ ] Disaster Recovery & Continuity: Backup Strategies, Redundancy, Failover, Disaster Recovery Planning, Business Continuity
- [ ] Observability & Diagnostics: Monitoring & Alerting, Logging, Tracing, Performance Profiling, Log Aggregation

### 3. Write taxonomy.yaml with full structure

- [ ] Create YAML structure with all 15 domains
- [ ] Add second-level categories (2–4 per domain)
- [ ] Add third-level topics where applicable
- [ ] Populate descriptions for each node
- [ ] Add prerequisite markers (e.g., "TCP/IP before Routing") where applicable
- [ ] Validate YAML syntax and structure

### 4. Validate against validation criteria

- [ ] Coverage: All major IT domains represented; no major gaps
- [ ] Stability: Domains and structure remain useful as technology evolves; vendor shifts don't fragment the taxonomy
- [ ] Hierarchy: All domains are 3–4 levels deep; leaf nodes are specific, intermediate nodes are meaningful
- [ ] Overlap analysis: Intentional overlaps (e.g., Security concepts in Cloud, DevOps, Networking) are documented
- [ ] Career path alignment: Real IT career progressions (Sys Admin → DevOps, Network Admin → Architect) are traceable through the taxonomy

### 5. Write taxonomy-validation-report.md

- [ ] Document domain selection rationale (why these 15?)
- [ ] Explain hierarchy design for each domain
- [ ] List validation results: coverage check, stability assessment, hierarchy depth review
- [ ] Call out any intentional overlaps and how they are handled
- [ ] Note any known gaps or trade-offs (e.g., vendor topics are optional, not required for v1)
- [ ] Include references to industry frameworks and career paths consulted

### 6. Finalize and commit

- [ ] Review taxonomy.yaml for completeness and correctness
- [ ] Review taxonomy-validation-report.md for clarity and accuracy
- [ ] Ensure all scenarios can be satisfied by this taxonomy design
- [ ] Commit to .planning/design-knowledge-taxonomy/
- [ ] Mark plan as state: confirmed once validated

## Blocks and dependencies

- No external dependencies
- No code implementation required
- Output is a design artifact (YAML + report) ready for the next ticket (seed-knowledge-map, #84)
