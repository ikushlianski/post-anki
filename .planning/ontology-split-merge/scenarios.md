---
type: scenarios
branch: ontology-split-merge
state: confirmed
updated: 2026-07-28
---

# Scenarios — ontology-split-merge

## SCENARIO 1 — Merging two subjects with real children reassigns every one, none orphaned or duplicated

The flagship scenario, built on the real production duplicate the issue names: a "Webdev" subject
and a "Programming / Web Development" subject. Before the merge, "Webdev" owns: a curriculum with
a real module carrying a tag assignment, and a second curriculum placed under a `domain_nodes` node
("Backend").

The tagged curriculum reaches its taggable state via the existing, already-proven
`studyTechnology` (docUrl against the `mock-docs-site` fixture) → poll to
`awaiting_source_approval` → `POST .../approve-sources {override:true}` → poll to `ready` sequence
(exactly what `features/curriculum/tests/study-technology-doc-url/test.ts` already does) —
verified this is necessary, not optional ceremony: `curriculum.$curriculumId.tsx`'s `editable`
flag (`status === 'ready' || status === 'confirmed'`) gates both the manual add-module UI and
`TagPicker`'s "+ tag" control, so a freshly-created (`status: 'curating'`) curriculum offers neither.

The "Backend" node itself is back-door seeded via direct SQL insert (mirroring
`features/domain-map/seeds/seed-domain-map-fixture.ts`'s existing pattern) — verified there is no
HTTP creation path for a `domain_nodes` row independent of the sibling-discovery-agent-driven
`resolveDomainPlacement` flow inside curriculum creation, so a direct insert is the correct setup
mechanism here, not a workaround; the curriculum placed on it is created through the real
front-door `addCourseUnderNode` action (the tree UI's own "add course here" affordance) — this one
does not need to reach `ready` status, since the domain-map read path filters only on
`domainNodeId` being set. The user decides "Programming / Web Development" is the name that should
survive and merges "Webdev" into it.

**UI clicking notes**: On the home page, the "Webdev" subject card shows a "Merge into…" control
next to its existing "Delete subject" button (same confirm-arm pattern: click reveals a `<select>`
+ Confirm/Cancel, click elsewhere or Cancel collapses it back). Selecting "Programming / Web
Development" from the dropdown and clicking Confirm submits immediately (no second modal) — the
button shows a busy state, then the "Webdev" card disappears from the page entirely (its subject
row was deleted) and a page-data refetch runs, matching this file's existing `DeleteSubjectButton`
interaction shape (`router.invalidate()` after the mutation resolves).

**Acceptance**:

- **BE**:
  - `POST /subjects/:targetId/merge` with `{ sourceSubjectId }`: inside one `db.transaction()`,
    acquires `pg_advisory_xact_lock(hashtext(id))` for both ids (sorted string order), re-reads
    both subjects post-lock, `UPDATE curricula SET subject_id = target WHERE subject_id = source`,
    `UPDATE domain_nodes SET subject_id = target WHERE subject_id = source`, `DELETE FROM subjects
    WHERE id = source` (direct delete, not `deleteSubject()`), commits, returns
    `{ targetSubjectId, sourceSubjectId, curriculaMoved, domainNodesMoved }`.
  - Input: `{ sourceSubjectId: string }`, validated via `mergeSubjectsInput` (new schema in
    `packages/shared/src/subject.ts`).
  - Edge cases: `targetId === sourceSubjectId` → 400 `self_merge`, no writes. Either subject
    missing → 404 `not_found`, no writes. `kind` mismatch (one `architecture-mentor`, one
    `language-practice`) → 400 `kind_mismatch`, no writes.
  - Negative assertion: `tag_assignments`, `node_feedback`, `study_item_feedback`, `probe_sessions`
    are never written to by this endpoint — the module carrying the tag assignment keeps its own
    id, so its tag survives untouched by construction, not by an explicit no-op write.
- **FE**:
  - `MergeSubjectButton` in `subject-section.tsx` — confirm-arm pattern, target `<select>` sourced
    from `allSubjects` prop minus self minus any `language-practice`-kind subject.
  - After confirm, the merged-away subject's card is gone from the page; the surviving subject's
    card, when expanded/navigated into, lists the moved curriculum.
- **Infra**: None.
- **Tests**:
  ```
  [x] @ontology-split-merge.S1 — e2e test written
  ```

---

## SCENARIO 2 — The merge-target picker never offers an invalid target

Guards the two precondition rules at the UI layer as well as the API layer (defense in depth): a
subject can't merge into itself, and an `architecture-mentor` subject can't merge into (or absorb)
a `language-practice` subject.

**UI clicking notes**: Opening the merge picker on any subject card renders a `<select>` whose
option list is every OTHER existing subject filtered to `kind === "architecture-mentor"` — the
subject's own name never appears as an option, and if an "English" (language-practice) subject
exists, it never appears as an option either, on either side (an English subject's own card
doesn't even render a merge control — see the `kind === 'language-practice'` branch already in
`subject-section.tsx` that renders "Open practice" instead of the curricula/create-curriculum UI
for that kind, which the merge control is added conditionally alongside).

**Acceptance**:

- **BE**:
  - `curl -X POST` a merge with `sourceSubjectId === targetId` → 400 `self_merge`, verified via a
    direct SQL check that neither subject's `curricula`/`domain_nodes` rows changed.
  - `curl -X POST` a merge between an `architecture-mentor` and a `language-practice` subject (in
    both directions — as source and as target) → 400 `kind_mismatch` each time, no writes.
- **FE**:
  - The merge-target `<select>`'s option list, read from the DOM, excludes the current subject's
    own name and excludes any `language-practice`-kind subject's name.
  - A `language-practice`-kind subject's own card renders no merge control at all.
- **Infra**: None.
- **Tests**:
  ```
  [x] @ontology-split-merge.S2 — e2e test written
  ```

---

## SCENARIO 3 — Merging two tags reassigns every assignment, deduping where a node already carries both

Two tags — "react" and "reactjs" — exist. One module is tagged "react" only. A different topic is
tagged with BOTH "react" and "reactjs" (the exact case a near-duplicate-tag merge exists to clean
up). The user merges "reactjs" into "react". The owning curriculum reaches its taggable
(`status: 'ready'`) state via the same `studyTechnology` + approve-override + poll sequence
documented in Scenario 1 — required for the same reason: `TagPicker`'s "+ tag" control is gated on
`editable`, unavailable before `ready`/`confirmed`.

**UI clicking notes**: The home page's "Cross-cutting tags" section (`TagList` in
`routes/index.tsx`) gets a small merge affordance per tag chip — clicking it reveals an inline
target-tag `<select>` (every other tag) + Confirm/Cancel, same confirm-arm shape as the subject
card's delete/merge controls. After confirming, the "reactjs" chip disappears from the tag list;
navigating to the module/topic pages that were tagged "reactjs" shows their tag chip now reading
"react" instead — and the topic that had both no longer shows a duplicate "react" chip.

**Acceptance**:

- **BE**:
  - `POST /tags/:targetId/merge` with `{ sourceTagId }`: inside one `db.transaction()`, locks both
    ids (sorted), re-reads both tags post-lock, deletes `tag_assignments` rows for the source that
    collide with an existing `(target, nodeType, nodeId)` row (the dedupe step — must run BEFORE
    the bulk update below or it violates `tag_assignments_tag_node_unique`), then
    `UPDATE tag_assignments SET tag_id = target WHERE tag_id = source` for the remainder,
    `UPDATE probe_sessions SET scope_id = target WHERE scope = 'tag' AND scope_id = source`,
    `DELETE FROM tags WHERE id = source`, commits.
  - Edge cases: self-merge → 400; missing tag → 404.
  - The dedupe case specifically: the topic tagged with both "react" and "reactjs" ends the merge
    with exactly ONE `tag_assignments` row for that topic (pointing at "react"'s id) — not two,
    not zero.
- **FE**:
  - Tag chips on the double-tagged topic render exactly one "react" chip after merge (not two
    stacked chips, not a chip that silently vanished).
  - Tag chips on the single-tagged module render "react" (the target) after merge, where they
    used to render "reactjs" (the source).
  - The tag list on the home page no longer shows "reactjs" after the merge.
- **Infra**: None.
- **Tests**:
  ```
  [x] @ontology-split-merge.S3 — e2e test written
  ```

---

## SCENARIO 4 — Merging a tag with an active tag-scoped probe session keeps that session reachable (backend-only)

Not e2e — proving this through a full quiz-taking UI flow just to exercise one `scope_id`
reassignment is disproportionate; the state change and its downstream effect
(`getActiveSessionRow('tag', tagId)` finding the row) are both fully exercised and asserted at the
integration-test level against a real Postgres instance, matching this project's own precedent
(`seed-knowledge-map`'s SCENARIO 6, `phrase-bank-concurrency-fix`'s integration tests) for
backend-only verification of a database-side effect with no independently meaningful UI surface
beyond what SCENARIO 3 already covers for the assignment-reassignment path itself.

**Acceptance**:

- **BE**:
  - Seed: a tag `sourceTag`, a `probe_sessions` row with `scope: 'tag'`, `scopeId: sourceTag.id`,
    `status: 'active'`.
  - After `mergeTags(targetTag.id, sourceTag.id)`, `getActiveSessionRow('tag', targetTag.id)`
    returns that same session row (by its `id`); `getActiveSessionRow('tag', sourceTag.id)` returns
    nothing (the old lookup key is dead, matching the deleted tag).
  - Edge case: a tag merge where NEITHER tag has any `probe_sessions` row — the
    `UPDATE probe_sessions SET scope_id = ... WHERE scope='tag' AND scope_id = source` affects 0
    rows, no error.
  - Edge case: BOTH tags already have their own independent active `probe_sessions` row before the
    merge. Verified `getActiveSessionRow`'s query (`probe-session.repo.ts`) orders by
    `createdAt desc` and returns `rows[0]` — after merge, both rows share `scope_id = target`, and
    the existing (not new) most-recent-first tie-break picks one of them. This is pre-existing
    behavior for any two sessions that already share a scope, not a gap this merge introduces —
    accepted as-is, asserted explicitly in the test rather than left as an untested assumption.
- **FE**: None (backend-only scenario, per triage above).
- **Infra**: None.
- **Tests**:
  ```
  [x] tag.repo.test.ts (or a new tag-merge.integration.test.ts) covers: active tag-scoped session
      migrates to the surviving tag's scopeId; a merge with zero sessions affects 0 rows without
      erroring
  ```

---

## SCENARIO 5 — Two concurrent merges for the same source subject don't corrupt data (backend-only)

Mirrors this project's own `phrase-bank-concurrency-fix` precedent: a deliberately constructed
concurrent pair of requests proves the advisory lock actually serializes them, rather than trusting
the transaction wrapper alone.

**Acceptance**:

- **BE**:
  - Seed: subjects A (source), B and C (two candidate targets), A owns one curriculum and one
    `domain_nodes` row.
  - Fire `POST /subjects/B/merge {sourceSubjectId: A}` and `POST /subjects/C/merge
    {sourceSubjectId: A}` concurrently (`Promise.all`, real HTTP or real function calls against a
    real Postgres connection pool — not mocked).
  - Exactly one of the two succeeds (its response has `curriculaMoved: 1, domainNodesMoved: 1`);
    the other returns a clean 404 `not_found` (A no longer exists by the time its post-lock re-read
    runs) — never a 500, never a response claiming success from both, never a state where A's
    curriculum/domain_node ends up attached to neither B nor C.
  - Direct SQL check after both requests resolve: exactly one of B or C shows
    `count(*) FROM curricula WHERE subject_id = <winner>` = 1; the loser shows 0; subject A no
    longer exists.
- **FE**: None (backend-only scenario, deliberate race exercised via direct calls, not browser
  clicks — a UI can't reliably construct this interleaving).
- **Infra**: None.
- **Tests**:
  ```
  [x] subject-merge-concurrency.integration.test.ts covers: two concurrent merges targeting the
      same source subject — one succeeds with the expected moved counts, the other 404s cleanly,
      no partial/duplicated ownership of the source's children
  ```
