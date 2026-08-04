---
type: debrief
branch: decouple-curricula-from-domain-nodes
feature: seed-static-taxonomy
updated: 2026-08-04
verdict: sound
diagram-format: ascii
---

# Architecture Review: seed-static-taxonomy

## What was reviewed

The final item in tonight's chain: wiring `apps/api/scripts/seed-domain-taxonomy.ts` to load and
seed the full 208-node, 15-domain taxonomy (`.planning/design-knowledge-taxonomy/taxonomy.yaml`,
built in #83) instead of the small 16-node placeholder hierarchy #84 shipped it with. Seeds into a
clearly-provisional, local-dev-only subject — production placement stays deliberately undecided.

## Documentation found

`.planning/unassigned/seed-static-taxonomy/spec.md` documents the design in full, written before
build. No drift found against the actual code.

## As-built architecture

```
 taxonomy.yaml (208 nodes)          local-dev-only subject
 ┌──────────────────────┐           (direct SQL INSERT,
 │ 15 top-level domains │           never seed-subjects.ts)
 │ 3-4 levels deep       │                    │
 └──────────┬───────────┘                     │
            ▼                                 ▼
   parseTaxonomyYaml()  ──────►  seedDomainTaxonomy(subjectId)
   (pure, throws on                    │
    duplicate names)                   ▼
                              domain_nodes table
                              (208 rows, source=
                               'static_taxonomy',
                               idempotent re-run)
                                       │
                                       ▼
                         curriculum_domain_node_mappings
                         (0 rows for these nodes — by
                          design, "Done when" criterion)

 ⚠ production subject placement: still an open decision
   on GitHub issue #84 — deliberately not resolved here
```

## Verdict

**Sound**, and notable for the discipline of what it deliberately did NOT do. The plan correctly
identified that "which subject gets the real taxonomy in production" is a genuine, still-open
architectural fork from #84 (Decision #2) — rather than silently picking an answer to get the
ticket "done," it seeded into an unambiguously-provisional local subject and left the real decision
exactly where the human left it. This is the right call: an unattended overnight loop making a
real, hard-to-reverse production data decision on the user's behalf would be a genuine overreach,
and the plan's own scope boundary says so explicitly.

The idempotency and coexistence testing (re-running against 208-already-seeded rows, seeding over
an old 16-node placeholder tree without disturbing it, verifying an unrelated subject's nodes stay
untouched) is exactly the right shape of test for a seed script — these are the failure modes that
actually matter for something that gets re-run by different people at different times, not
theoretical edge cases.

## Questions a reviewer would ask

1. Now that a local-dev-only "IT Taxonomy (local dev seed)" subject exists with 208 real nodes,
   is there a risk someone starts a real curriculum against it before the production placement
   decision is made — effectively pre-deciding the fork by accident through normal use rather than
   deliberate choice?
2. `parseTaxonomyYaml` drops `id` and `prerequisites` from the YAML source since no schema column
   exists for either — is `prerequisites` (the "learn TCP/IP before Routing" guidance from #83's
   design) planned for a future column, or was it deliberately decided as informational-only,
   never enforced in the database?
3. The taxonomy YAML file was copied into `apps/api/scripts/seed-data/it-taxonomy.yaml` rather than
   referencing `.planning/design-knowledge-taxonomy/taxonomy.yaml` directly — once #83's taxonomy
   design changes (if it ever does), is there a process to keep these two copies in sync, or does
   the seed-data copy become the de facto source of truth once this ships?
