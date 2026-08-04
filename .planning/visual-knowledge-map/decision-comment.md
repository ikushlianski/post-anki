## Decisions needed

Planning for this ticket (`/plan-ie`, run overnight with no one available to answer questions live)
surfaced two real forks. Each has a recommendation below so the plan can proceed without blocking —
but each changes user-visible behavior the ticket left open, so neither was decided silently. The
plan document reflects the recommended option for each; flag any of these you'd resolve differently
and the plan gets adjusted before implementation starts.

---

### 1. Which visualization type — mind map, network graph, treemap, or radial/sunburst?
**Why this can't be defaulted:** changes user-visible behavior beyond what the ticket specified — the ticket itself lists all four as open options with no stated preference.
**Options:**
1. Mind map / tree layout (hierarchical, root-to-leaf) — matches the actual data shape (`domain_nodes` is a strict parent-child tree; there is no cross-link or prerequisite relationship in the schema at all), and is what the rendering library (`@xyflow/react`) has first-class layout support for via `d3-hierarchy`'s tree layout.
2. Network graph (nodes + edges, implying cross-links) — the data has no cross-link relationships to show, so this would just render the same tree as option 1 but with graph-styled affordances (e.g. force layout) that don't fit strict hierarchy data and read as noise.
3. Treemap (area = knowledge amount, color = mastery) — communicates scale well but drill-down/expand-collapse (a stated requirement) is a poor fit for treemap interaction patterns, and `@xyflow/react` has no first-class treemap layout.
4. Radial/sunburst — visually distinctive but degrades badly with unbalanced tree depth (some domains 2 levels deep, others 4), and has no first-class support in the chosen library.
**Recommendation:** option 1 — matches the data model exactly, matches the chosen library's built-in layout tooling, and is the only option with a well-supported drill-down/expand-collapse interaction pattern.

### 2. Does the visual map replace the existing text tree, or live alongside it?
**Why this can't be defaulted:** changes user-visible behavior beyond what the ticket specified — the ticket asks "page-level or dashboard widget?" without resolving it, and the current text tree (`DomainMapTree`) carries real per-node actions (add curriculum, merge nodes, set target depth) that don't obviously fit inside graph nodes at small screen sizes.
**Options:**
1. Add the visual map as a togglable second view on the same route (`/subject/$subjectId/map`), defaulting to whichever proves more useful, with the existing text-tree view (and all its actions) kept exactly as-is under the other toggle state — nothing is lost, the new view is additive.
2. Replace the text tree outright with the visual map — either the per-node actions (add curriculum, merge, set target depth) get redesigned to work inside graph nodes in this same ticket (significant added scope, not what this ticket's done-when criteria ask for), or they're dropped, which is a real usability regression for a working feature.
**Recommendation:** option 1 — preserves every existing capability, keeps this ticket scoped to what its own done-when criteria ask for (a visual representation existing, not a redesign of the action UI), and is trivially reversible if the map view later proves good enough to become the default.

---

**Meanwhile:** the plan (`.planning/visual-knowledge-map/spec.md` in the repo) proceeds using the
recommended option for both, clearly marked, so implementation isn't blocked. Reply with option
numbers for either you'd resolve differently (e.g. "1C, 2B") and remove the `needs:decision` label
once decided.
