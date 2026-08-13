---
type: spec
branch: To-Learn-List
task: learning paths — ordered routes through the taxonomy toward a target role
complexity: complex
state: draft
updated: 2026-08-08
---

# Spec: learning paths

### Summary

A learning path is an ordered list of steps through the existing objective taxonomy — a role
template (e.g. "Frontend Engineer") resolves to a fixed set of existing Areas/sub-subjects,
topologically ordered by the taxonomy's own prerequisite edges. A path never creates a taxonomy
node, never creates a curriculum, and never generates content on creation — it is a read/order
overlay on structure that already exists (or doesn't yet). Prerequisite edges themselves are new:
`it-taxonomy.yaml` has carried them since #83, but `parse-taxonomy-yaml.ts` has dropped them as
"no schema support" since the intake module — this spec revives them into a real edge table.
Progress is derived at read time from the same subtree rollup the domain map already uses; nothing
about a step's status is stored. Next-step selection is "first not-done step in fixed order" —
deliberately not a navigable prerequisite graph, per the recorded Khan Academy lesson.

### Implementation Phases

| Phase | Scenarios | BE Requirements | FE Requirements | Dependencies | Performance Target |
|---|---|---|---|---|---|
| 1 — Prerequisite edges | S14, S15 | revive `yamlId`/`prerequisites` in the parser, `domain_node_prerequisites` table, seed second pass | None | None | Seed idempotent, single run |
| 2 — Path creation | S1, S2, S3, S4, S10 | role templates, `resolvePathOrder`, creation orchestrator, repo, controller | None | Phase 1 | Order resolved with zero extra DB round trips beyond the target set |
| 3 — Progress & next step | S5, S6, S7, S8, S9, S11 | `pathProgress`, `nextPathStep`, daily-push scoped to step curricula | None | Phase 2 | Progress computed in one pass over already-fetched topics |
| 4 — Web | S12, S13 | None | browse, create, track, abandon | Phase 3 | None |

### Derivers

| Deriver | Inputs | Output | Scenarios covered |
|---|---|---|---|
| `resolveTaxonomyPrerequisiteEdges` | `yamlIdToNodeId: Map<string,string>` (built during seeding), raw nodes `{yamlId, prerequisiteYamlIds}[]` | `{domainNodeId, prerequisiteNodeId}[]` — a prerequisite id absent from the map is dropped, never thrown (the two-pass seed guarantees every real id resolves; a dangling id is a YAML typo, not a reason to abort seeding) | S14 |
| `resolvePathOrder` | `targetNodeIds: string[]`, `nodes: {id, order}[]` (taxonomy order for fallback/ties), `prerequisiteEdges: {domainNodeId, prerequisiteNodeId}[]` | ordered `string[]` — topological sort restricted to `targetNodeIds` (edges to nodes outside the target set are ignored); falls back to taxonomy `order` when no edges apply among the targets or when a cycle/dangling reference is detected among them | S1, S2, S15 |
| `pathProgress` | `steps: {domainNodeId}[]` (in stored order), `nodes: DomainNodeRef[]`, `curriculumTopics: DomainNodeCurriculumTopics[]` | `{ overallStatus: "not_started" \| "in_progress" \| "done"; steps: {domainNodeId, progress: ModuleProgress, status}[] }` — each step reuses `domainNodeProgress` unmodified; dedups by `topic.id` across steps whose subtrees overlap (same pattern `domainNodeProgress` already applies for shared ancestors) | S5, S6, S9, S11 |
| `nextPathStep` | `steps: {domainNodeId, status}[]` (stored order) | `domainNodeId \| null` — first step whose status isn't `"done"`; `null` once every step is `"done"` | S7 |

### Files by scenario

| Scenario | Backend | Frontend | Infrastructure |
|---|---|---|---|
| S1 | `role-templates.ts`, `learning-path-creation.orchestrator.ts`, `resolve-path-order.ts`, `learning-path.repo.ts`, `learning-path.controller.ts` | None | None |
| S2 | `resolve-path-order.ts` | None | None |
| S3 | `learning-path.repo.ts` (nullable curriculum join per step), `learning-path-creation.orchestrator.ts` (no generation call) | `learning-path-detail.tsx` (empty-step CTA into existing `learning-list/capture-form.tsx`) | None |
| S4 | `role-templates.ts`, `learning-path-creation.orchestrator.ts` (uses existing `domain-node-name-resolver.ts`, throws on unresolved) | None | None |
| S5 | `path-progress.ts`; reuses `packages/core/src/domain-map/domain-map-progress.ts` unmodified | None | None |
| S6 | `learning-path.repo.ts` (no progress/status columns), `path-progress.ts` | `learning-path-detail.tsx` (renders live values only) | None |
| S7 | `next-path-step.ts` | `learning-path-detail.tsx` (linear list, "next" highlight, no graph widget) | None |
| S8 | `learning-path.controller.ts` (scopes candidates to the step's mapped curricula, calls existing `packages/core/src/curriculum/daily-push.ts` `selectDailyPush` unmodified) | `learning-path-detail.tsx` (renders the same push-question surface used elsewhere) | None |
| S9 | `path-progress.ts` | `learning-path-detail.tsx` (completed banner) | None |
| S10 | `learning-path.controller.ts` (status → `abandoned`), `learning-path.repo.ts` | `abandon-path-control.tsx` | None |
| S11 | `path-progress.ts` (dedup by topic id) | None | None |
| S12 | `learning-path.controller.ts` (`GET /role-templates`), `role-templates.ts` | `role-template-browser.tsx` | None |
| S13 | `learning-path.controller.ts`, `learning-path-creation.orchestrator.ts` | `learning-path-create.tsx`, `learning-path-list.tsx`, `learning-path-detail.tsx` | None |
| S14 | `parse-taxonomy-yaml.ts`, `seed-domain-taxonomy.ts`, `resolve-taxonomy-prerequisite-edges.ts` | None | None |
| S15 | `resolve-path-order.ts` | None | None |

### Files to create

```
packages/core/src/learning-path/           — resolvePathOrder, resolveTaxonomyPrerequisiteEdges, pathProgress, nextPathStep + tests
packages/shared/src/learning-path.ts        — zod schemas: path, step, role template, progress, create-input
apps/api/src/learning-path/                 — controller, repo, creation orchestrator, role-templates.ts
apps/api/scripts/seed-data/role-paths.yaml  — curated role → ordered target Area/sub-subject paths
apps/web/src/learning-path/                 — role-template-browser, create, list, detail, abandon control, api-client, model
```

### Files to modify

```
apps/api/src/db/schema.ts                — domain_node_prerequisites, learning_paths, learning_path_steps
apps/api/src/domain-map/parse-taxonomy-yaml.ts — revive yamlId + prerequisiteYamlIds on SeedNode (optional fields)
apps/api/scripts/seed-domain-taxonomy.ts  — second pass: build yamlId→nodeId map, resolve + upsert prerequisite edges
apps/api/src/router.ts                    — /role-templates, /learning-paths routes (resource-named, plural)
packages/core/src/index.ts                — export ./learning-path/index
packages/shared/src/index.ts              — export ./learning-path
apps/web/src/router.tsx                   — /learning-paths routes
```

### Data model changes

- New: `domain_node_prerequisites` (`domainNodeId`, `prerequisiteNodeId`; unique pair; index on
  `domainNodeId`). No `.references()` FK — matches `domain_nodes`'/`curriculum_domain_node_mappings`'
  existing plain-text-column + app-level-validation convention.
- New: `learning_paths` (`id`, `name`, `targetRoleLabel`, `status`: `draft|active|completed|abandoned`,
  `createdAt`, `startedAt`, `completedAt`).
- New: `learning_path_steps` (`id`, `pathId`, `domainNodeId`, `order`, `createdAt`) — deliberately no
  progress/status column; always derived (see Decisions).
- No changes to any existing table.
- Migration generated via Drizzle, run through the existing migrate script. Never pushed.

### Documentation changes

- Learning domain: new component doc for learning paths (role templates, order resolution,
  read-time progress).
- Knowledge-map domain: update the existing taxonomy component doc — prerequisites are now
  schema-backed (`domain_node_prerequisites`), superseding the intake-era "informational, not
  enforced, no schema support" note in `parse-taxonomy-yaml.ts`.

### BAML test coverage

Not applicable — no BAML functions touched. Path creation has zero LLM calls (role templates are
static curated data, not agent output); the rest of this module is pure derivers + CRUD.

### Decisions made autonomously

- **Prerequisite edges get a real table, reversing the intake module's explicit call.** `parse-
  taxonomy-yaml.ts`'s existing comment says `id`/`prerequisites` are dropped because "domain_nodes
  has no column for either" and #83's architecture.md called them "informational, not enforced."
  Module 1.2 requires real resolution, so this spec adds `domain_node_prerequisites` (an edge table,
  not a column — avoids ever putting a foreign id inside `domain_nodes` itself, matching the
  no-FK-column convention) and revives the two YAML fields as optional `SeedNode` additions.
- **Edges are resolved in a second seed pass, not persisted `yamlId`s.** The seed script already
  returns each node's real db id as it inserts (existence-checked, idempotent); building an
  in-memory `yamlId → dbId` map across ALL roots first, then resolving every node's
  `prerequisiteYamlIds` against that complete map, means cross-branch and forward references (e.g.
  `cloud-computing`'s prerequisites naming `networking`, declared earlier in the file) resolve
  correctly regardless of YAML declaration order — with no new column and no schema churn to
  `domain_nodes`.
- **A step targets a domain node, never a curriculum.** `learning_path_steps.domainNodeId` is the
  only foreign reference; content is discovered live via `curriculum_domain_node_mappings` (status
  `confirmed`) under that node's subtree, exactly like the domain map already does. This is the
  same inversion `decouple-curricula-from-domain-nodes` established — a path routes through the
  taxonomy, it never owns or creates curricula.
- **Step order is a snapshot, not recomputed.** `learning_path_steps.order` is fixed at creation
  time from `resolvePathOrder`'s output. If prerequisite edges change later (a future taxonomy
  edit), an in-progress path does not silently reshuffle underneath the learner.
- **Progress and step status are never persisted — always derived at read time**, mirroring
  liveness's read-time-derivation precedent (S15 of the intake spec) rather than domain-node
  columns. This guarantees a step's status can never drift from the live curriculum/gap data and
  needs no recompute job.
- **No hard locking between steps.** The linear-order decision (Khan Academy retiring its
  prerequisite map because learners preferred linear progression) governs the DEFAULT
  presentation and the recommended next-step, not an access gate. A learner can open any step's
  content directly; gating would add queue-management pressure the product's own principles
  reject ("system selects, user never manages a queue"; "no session debt"). No lock/unlock state
  is stored.
- **Role templates are static curated YAML, not AI output**, resolved to existing node ids via the
  already-existing `domain-node-name-resolver.ts` (case-insensitive path match, the same resolver
  the sibling-discovery agent uses). An unresolved target name throws at path creation — unlike the
  AI mapping agent's silent-drop-unmatched pattern, an unresolved name here is a curated-data typo,
  not an acceptable "AI got it wrong," so it must fail loudly before anything is written.
- **Path completion = every step's rollup percent reaching 100** (all included topics mastered).
  Reuses the existing rollup threshold; no new partial-completion percentage is invented.
- **Abandoning a path only flips `learning_paths.status`.** No cascade — every mapped curriculum,
  topic, gap and mastery row is untouched, matching the non-destructive convention `isDormant`
  already established (decay/decline stops surfacing, never deletes).
- **Multiple concurrent paths are allowed**, including two paths that share a step's domain node
  (e.g. "Frontend Engineer" and "Full-Stack Engineer" both include a React Area). `pathProgress`'s
  dedup-by-topic-id guards the only place double-counting could otherwise appear.
- **"What to study now" inside a step reuses `selectDailyPush` unmodified**, called with candidates
  pre-filtered to that step's mapped curricula. No second gap-ranking algorithm is introduced, per
  this module's explicit constraint.
- **Role templates ship for Web Development's three fixed sub-subjects only in v1** (e.g.
  "Frontend Engineer" → React Areas; "Full-Stack Engineer" → React + Node.js Areas; "Cloud
  Engineer" → AWS Areas) — matches the intake module's own Web-Development-only scope boundary.
  Other domains get role templates once they get fixed Areas.

### Implementation order

1. `parse-taxonomy-yaml.ts` revives `yamlId`/`prerequisiteYamlIds`; `resolveTaxonomyPrerequisiteEdges` — red-green-refactor
2. Schema: `domain_node_prerequisites`, `learning_paths`, `learning_path_steps`; generated migration
3. `seed-domain-taxonomy.ts` second pass writes prerequisite edges idempotently
4. `resolvePathOrder`, `pathProgress`, `nextPathStep` — derivers, unit-tested against fixtures before any IO
5. `role-paths.yaml` + `role-templates.ts` resolution against the existing `domain-node-name-resolver.ts`
6. `learning-path.repo.ts`, `learning-path-creation.orchestrator.ts`, `learning-path.controller.ts`
7. Router wiring (`/role-templates`, `/learning-paths`, `/learning-paths/:id/abandon`)
8. Wire "what to study now" through the existing `push/` module, scoped to the current step's curricula
9. Web: role template browser, create, list, detail (progress + next step + question surface), abandon control

### Scope boundary

- Web Development only (React/Node.js/AWS sub-subjects) for role templates in v1 — no other domain
  has fixed Areas yet (Module 0's own boundary).
- No path editing after creation (reorder/add/remove a step) — recreate a new path instead.
- No step locking/gating — linear order is a UI default, never an access restriction.
- No content generation triggered by path creation or step navigation — Module 0's liveness/slice
  gates are unchanged and untouched.
- No AI involved in path creation — role templates are static curated data, no new agent.
- Prerequisite edges are seeded once from `it-taxonomy.yaml`; no UI to author or edit an edge.
- No parallel/branching paths ("either X or Y") — v1 is a strict ordered list only.
