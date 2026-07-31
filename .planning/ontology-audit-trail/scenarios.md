---
type: scenarios
branch: ontology-audit-trail
task: ontology-audit-trail
state: confirmed
updated: 2026-07-31
---

# Scenarios: Merge/split audit trail

## SCENARIO 1 — Merging two subjects via the UI writes a visible, correctly-populated log row

A user merges two subjects from the home page using the existing `MergeSubjectButton` flow (the
same UI `ontology-split-merge` already shipped). After the merge completes, they navigate to
`/admin-observability` and see a new row in "Recent ontology merges": entity `subject`, the correct
target and source subject names, and the real counts of curricula/domain-nodes that were reassigned
by that specific merge — not placeholder or zero values.

**Acceptance:**
- **BE:** `mergeSubjects` (called via the real `POST /subjects/:id/merge` route, not a direct
  function call) writes one `ontology_merges` row inside the same transaction as the reassignment,
  with `entity_type: 'subject'`, `target_name`/`source_name` matching the real subject names, and
  `reassigned_counts` matching the function's own returned `curriculaMoved`/`domainNodesMoved`
  exactly — cross-checked via direct SQL against the real count of `curricula`/`domain_nodes` rows
  now carrying the target's id (not just asserted non-zero; `mergeSubjects` has no separate
  backend-integration test in this plan, so this is the only place its count correctness is
  proven). `GET /admin-observability` (`handleGetAdminObservability`) includes this row in
  `recentMerges`.
- **FE:** `/admin-observability`'s "Recent ontology merges" table renders the row with the correct
  target name, source name, and a human-readable reassigned-counts string.
- **Infra:** None.
- Tests:
  [x] @ontology-audit-trail.S1 — e2e test written

## SCENARIO 2 — `mergeTags` writes a correct audit log row (not e2e — see below)

A tag merge (deduping one shared assignment, moving one distinct assignment) writes a log row whose
counts exactly match what the merge itself actually did — not just "some row exists."

**Acceptance:**
- **BE:** `mergeTags` writes one `ontology_merges` row with `entity_type: 'tag'`, correct
  `target_name`/`source_name`, and `reassigned_counts` = `{ assignmentsMoved, assignmentsDeduped,
  sessionsMoved }` matching the function's own return value exactly (cross-checked value-for-value
  in the same test, not just asserted non-zero).
- **FE:** None — S1 already proves the read/render path generalizes across entity types (S5 proves
  it explicitly for all four); this scenario is the write-path correctness proof for tags
  specifically.
- **Infra:** None.
- Tests:
  [x] `apps/api/src/ontology-merge/ontology-merge-log.integration.test.ts` — mergeTags case

**Not e2e — see playwright.md.** `mergeTags`'s own UI trigger (the tag-merge control) was already
proven end-to-end by `ontology-split-merge`'s own plan; re-driving it here would duplicate that
proof rather than add new coverage. What's new about this item is the *log row's correctness*,
which a direct-Postgres integration test proves more precisely (exact count cross-checking) than an
e2e assertion on rendered table text would.

## SCENARIO 3 — `mergeCurricula` writes a correct audit log row (not e2e — see below)

A curriculum merge (moving modules, topics, sources, socratic sessions, and probe sessions) writes
a log row whose five reassigned-count fields exactly match what the merge actually moved.

**Acceptance:**
- **BE:** `mergeCurricula` writes one `ontology_merges` row with `entity_type: 'curriculum'`,
  correct `target_name`/`source_name`, and `reassigned_counts` = `{ modulesMoved, topicsMoved,
  sourcesMoved, socraticSessionsMoved, probeSessionsMoved }` matching the function's own return
  value exactly, for all five fields.
- **FE:** None — same reasoning as S2.
- **Infra:** None.
- Tests:
  [x] `apps/api/src/ontology-merge/ontology-merge-log.integration.test.ts` — mergeCurricula case,
      plus the negative case (`mergeCurricula` against a `target_failed` target writes zero
      `ontology_merges` rows) co-located in the same file — `target_failed` is used here rather
      than a `mergeDomainNodes`/`cycle` case since it needs no multi-node tree setup.

**Not e2e — see playwright.md.** Same reasoning as S2 — `curriculum-merge`'s own plan already
proved the UI trigger end-to-end; this item's new surface is log-row correctness, proven precisely
via direct Postgres assertions.

## SCENARIO 4 — `mergeDomainNodes` writes a correct audit log row (not e2e — see below)

A domain-node merge (moving a curriculum and re-parenting a child node) writes a log row whose two
reassigned-count fields exactly match what the merge actually moved.

**Acceptance:**
- **BE:** `mergeDomainNodes` writes one `ontology_merges` row with `entity_type: 'domain_node'`,
  correct `target_name`/`source_name`, and `reassigned_counts` = `{ curriculaMoved,
  childNodesMoved }` matching the function's own return value exactly.
- **FE:** None — same reasoning as S2/S3.
- **Infra:** None.
- Tests:
  [x] `apps/api/src/ontology-merge/ontology-merge-log.integration.test.ts` — mergeDomainNodes case.
      (The negative-case, rejected-merge-writes-zero-rows proof lives with S3's `mergeCurricula`/
      `target_failed` case instead — see S3 — since one negative case is sufficient to prove the
      log write only ever runs on the success path, and `target_failed` needs no tree setup.)

**Not e2e — see playwright.md.** Same reasoning as S2/S3 — `domain-node-merge`'s own plan already
proved the UI trigger end-to-end.

## SCENARIO 5 — The admin view renders all four entity types correctly, independent of S1–S4

Seeded directly (back door) with one `ontology_merges` row per entity type — subject, tag,
curriculum, domain_node — each with distinct target/source names and distinct `reassigned_counts`
shapes (proving the display code doesn't assume a shared count-field vocabulary across entity
types). Loading `/admin-observability` renders all four rows correctly: right entity label, right
names, right reassigned-counts text for each entity type's own distinct field set.

**Acceptance:**
- **BE:** `listRecentOntologyMerges(50)` returns all 4 rows via `GET /admin-observability`.
- **FE:** The "Recent ontology merges" table renders 4 rows; for each, the entity-type cell shows
  the right label, and the reassigned-counts cell shows the right key:value text for that
  particular entity type's own count field names (e.g. tag's row shows `assignmentsMoved`/
  `assignmentsDeduped`/`sessionsMoved`; domain_node's row shows `curriculaMoved`/`childNodesMoved`)
  — proving the generic `Record<string, number>` rendering genuinely generalizes, not just for the
  one shape S1 happens to exercise (subject's).
- **Infra:** None.
- Tests:
  [x] @ontology-audit-trail.S5 — e2e test written
