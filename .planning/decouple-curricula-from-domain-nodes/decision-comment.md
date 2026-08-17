## Decisions needed

Planning for this ticket (`/plan-ie`, run overnight with no one available to answer questions live)
surfaced six real forks. Each has a recommendation below so the plan can proceed without blocking —
but each genuinely changes user-visible behavior or touches data in a way that's hard to undo, so
none were decided silently. The plan document reflects the recommended option for each; flag any of
these you'd resolve differently and the plan gets adjusted before implementation starts.

---

### 1. Should domain nodes stay scoped per subject, or become one global tree?
**Why this can't be defaulted:** changes the shape of a core business entity; hard to undo once curricula are linked; would restructure multiple existing features at once (node merging, priority review, the domain map page).
**Options:**
1. Keep domain nodes scoped per subject (each subject keeps its own tree; the IT taxonomy seeds into whichever subject needs it) — everything that already works (merging nodes, priority review, the domain map page) keeps working exactly as it does today, for every subject.
2. Make domain nodes one global tree shared across every subject — bigger rebuild: node merging, priority review, and the map page would all need to learn "which subject's curricula to show," and unrelated subjects (Business, Investing, Music, languages) would share one knowledge tree even though the taxonomy is IT-only.
**Recommendation:** option 1 — matches how the app already treats subjects as separate life areas, and avoids rebuilding three features that already work.

### 2. Which subject receives the seeded IT taxonomy?
**Why this can't be defaulted:** irreversible once curricula start linking to it; changes what the user sees in a way the ticket never specified; no default is obviously safe.
**Options:**
1. Seed it into the existing "Programming / Web Development" subject — no new subject appears, but that subject's stated scope (frontend, backend, cloud, data, devops) is narrower than the taxonomy (which also covers networking, security, sysadmin, IT service management, disaster recovery) — its scope broadens silently.
2. Create a new subject (e.g. "IT & Computer Science") dedicated to the taxonomy — a new item appears in the subject list; existing "Programming / Web Development" curricula would need to be re-pointed at the new subject for mapping to make sense.
**Recommendation:** option 2 — the taxonomy's real scope is broader than "Programming / Web Development," and a dedicated subject avoids silently reshaping what an existing subject means.

### 3. When does the AI mapping step run — during curriculum creation, or on demand afterward?
**Why this can't be defaulted:** changes user-visible behavior the ticket didn't specify.
**Options:**
1. On-demand — curriculum creation stays exactly as fast as today; mapping is a separate "Map to taxonomy" step triggered and reviewed afterward, the same pattern already used for the recent duplicate-detection scan.
2. Synchronous — mapping runs automatically as part of curriculum creation, adding one more AI call (and its latency/failure risk) to the creation flow, but the curriculum shows up already placed.
**Recommendation:** option 1 — matches the on-demand pattern this codebase just chose for AI-assisted duplicate detection, for the same latency/cost-control reasons.

### 4. What happens to domain nodes that already exist from the old dynamic-creation flow?
**Why this can't be defaulted:** touches a core entity; hard to undo; changes behavior the ticket left open; no default is obviously safe for live data.
**Options:**
1. Leave them untouched, unlinked from the new taxonomy — old curricula keep pointing at their old ad hoc nodes; nothing changes until someone manually re-maps.
2. Auto-reconcile them into the new taxonomy using the existing node-merge tool, surfaced as suggestions to approve one by one (reusing the review pattern already built for merges and priority suggestions) — old data gradually folds into the static tree instead of sitting alongside it forever.
**Recommendation:** option 2 — matches this ticket's own stated intent ("existing domain nodes become part of the static taxonomy") and reuses an existing, already-tested merge tool. This piece depends on decision #2 above (it targets whichever subject/tree wins there), so it's scoped as a follow-on step rather than blocking the rest of this ticket.

### 5. What happens to subjects that have no static taxonomy (Business, Investing, Music, languages)?
**Why this can't be defaulted:** changes user-visible behavior the ticket didn't specify.
**Options:**
1. Keep today's dynamic node-creation flow (the AI "sibling-discovery" agent) unchanged for any subject with no seeded static taxonomy — only the IT subject gets the new map-into-existing-nodes flow.
2. Remove dynamic node creation everywhere — every subject without a taxonomy stops growing its domain map until one is designed for it (a regression for those 7 subjects today).
**Recommendation:** option 1 — avoids regressing a working feature for every non-IT subject; this ticket's scope is explicitly the IT taxonomy.

### 6. What happens to the existing `curricula.domain_node_id` column?
**Why this can't be defaulted:** touches a core entity's schema; hard to undo once dropped.
**Options:**
1. Migrate its data into the new curriculum-to-domain-node mapping table (one row per existing link) and drop the old column in the same migration — one mechanism going forward.
2. Keep the old column indefinitely alongside the new mapping table for backward compatibility — nothing breaks, but two ways to record the same fact from then on.
**Recommendation:** option 1 — this app has retired old columns cleanly in prior tickets (domain-node-merge, duplicate-detection); carrying two mechanisms isn't buying anything here.

---

**Meanwhile:** the plan (`.planning/decouple-curricula-from-domain-nodes/spec.md` in the repo) proceeds
using the recommended option for all six, clearly marked, so implementation isn't blocked. Reply with
option numbers for any you'd resolve differently (e.g. "1B, 2A") and remove the `needs:decision` label
once decided.
