---
type: spec
branch: ontology-split-merge
task: "Manage the ontology over time — merge subjects and merge tags, with children correctly reassigned (issue #56)"
complexity: medium
state: confirmed
updated: 2026-07-28
verification:
  targetDb: post-anki-e2e (local Docker Postgres, :5436)
  playwrightPlan: .planning/ontology-split-merge/playwright.md
  stateFixtures: .planning/ontology-split-merge/state-fixtures.md
---

# Spec: Ontology merge — Subjects and Tags

## What this ships

Two new "merge" operations, reachable from the app itself:

1. **Subject merge** — from a subject's card on the home page, absorb another subject into it.
   Every curriculum and the whole `domain_nodes` forest owned by the absorbed subject move to the
   surviving subject; the absorbed subject's row is deleted. Restricted to
   `kind: "architecture-mentor"` subjects on both sides (see Decisions made autonomously #3).
2. **Tag merge** — from the home page's tag list, absorb one tag into another. Every
   `tag_assignments` row and any active tag-scoped probe session move to the surviving tag; the
   absorbed tag's row is deleted.

No schema migration. No new tables or columns — this is a pure reassignment feature over the
existing shape.

## Scope boundary

**In scope**: merge only, for Subjects and Tags. The issue's own Done-when is a disjunction — "a
Subject, course, **or** tag can be split into multiple **or** merged into one" — so shipping
Subject-merge + Tag-merge satisfies the criterion on its own terms; this is a legitimate narrowing
of the issue's full ask, not a silent scope cut, and is stated here explicitly for that reason.

**Out of scope, logged as fast-follows**:

- **Curriculum (course) merge.** A curriculum's real child set, enumerated by grep (not inferred
  from `schema.ts` column names, since this schema has almost no FKs), is far larger than a
  Subject's or Tag's: `sources`, `modules`→`topics`→`gaps`, `curriculum_structure_turns`,
  `structure_research_candidates`, `probe_sessions` (nullable `curriculumId`), `socratic_sessions`,
  `lectures` (via `topicId`), `llm_call_events`. Eight table families with no FK backing them,
  versus two for Subject merge and two for Tag merge. Meaningfully higher blast radius; deserves
  its own planning pass rather than being bundled in here by default.
- **Split, for any entity.** Merge is a strict reassignment with no judgment call about where a
  child goes. Split requires deciding how to divide children between the new pieces — a genuinely
  harder, riskier problem for a first cut, and the issue's own real, live example today ("Webdev" +
  "Programming / Web Development" duplicates) is a merge case, not a split case.
- **Language-practice subject merge.** See Decision #3 below — a real judgment call with no safe
  default (which subject's practice settings win?), not attempted here.
- **Closing the residual `createCurriculum`-vs-merge concurrency window.** See Decision #6.

## Data model

No changes. `subjects`, `curricula`, `domain_nodes`, `tags`, `tag_assignments`, `probe_sessions`
all keep their current shape. This feature is pure read-then-reassign over existing columns.

## New endpoints

| Method | Path | Body | Behavior |
|---|---|---|---|
| POST | `/subjects/:targetId/merge` | `{ sourceSubjectId: string }` | Absorbs `sourceSubjectId` into `:targetId`. Target survives (keeps name/description/kind); source is deleted. |
| POST | `/tags/:targetId/merge` | `{ sourceTagId: string }` | Absorbs `sourceTagId` into `:targetId`. Target survives (keeps name); source is deleted. |

Both are action-verb sub-paths on an existing resource id, matching this codebase's existing
convention for non-CRUD actions (`/curricula/:id/confirm-structure`, `/curricula/:id/approve-sources`).

### `POST /subjects/:targetId/merge` — behavior contract

Preconditions (checked inside the transaction, after acquiring locks — not before, to avoid a
check-then-act race against a concurrent merge of the same subjects):

1. `targetId !== sourceSubjectId` → 400 `self_merge`.
2. Both subjects exist → 404 `not_found` (names which id, target or source, is missing).
3. Both subjects have `kind === "architecture-mentor"` → 400 `kind_mismatch` if either doesn't
   (this includes the case where the same subject is targeted twice by two different merges racing
   — the second one will 404 on the re-read below before it ever reaches this check for the
   already-deleted source).

Procedure, inside one `db.transaction()`:

1. Acquire `pg_advisory_xact_lock(hashtext(id))` for both `targetId` and `sourceSubjectId`, in
   **sorted string order** (lock the lexicographically smaller id first) — prevents a deadlock
   between two concurrent merges that reference the same pair of subjects in opposite direction
   (`A absorbs B` racing `B absorbs A`).
2. Re-read both subjects inside the lock. If either is now missing (a concurrent merge already
   deleted it), return 404 `not_found` — this is the clean, catchable failure mode for the
   double-merge race (Scenario 5).
3. Re-check the `kind` precondition against the freshly-read rows.
4. `UPDATE curricula SET subject_id = :targetId WHERE subject_id = :sourceSubjectId`
5. `UPDATE domain_nodes SET subject_id = :targetId WHERE subject_id = :sourceSubjectId` — moves
   the whole forest; `parent_id` values are never touched, so the source subject's root node(s)
   become additional root(s) under the target (already-supported shape, see architecture.md).
6. `DELETE FROM subjects WHERE id = :sourceSubjectId` — a direct delete, **not** a call to the
   existing `deleteSubject()` repo function (see Decision #4).
7. Commit. Return `{ targetSubjectId, sourceSubjectId, curriculaMoved: number, domainNodesMoved: number }`.

No changes needed to `tag_assignments`, `node_feedback`, `study_item_feedback`, or `probe_sessions`
for a subject merge — verified by grep (see discussion.md) that none of them ever reference a
subject id, and module/topic ids are stable across the reassignment (only their owning curriculum's
`subject_id` changes).

### `POST /tags/:targetId/merge` — behavior contract

Preconditions: `targetId !== sourceTagId` → 400 `self_merge`; both tags exist → 404 `not_found`.

Procedure, inside one `db.transaction()`:

1. Acquire `pg_advisory_xact_lock(hashtext(id))` for both ids, sorted order (same reasoning as
   subject merge).
2. Re-read both tags inside the lock; 404 if either is now missing.
3. `DELETE FROM tag_assignments WHERE tag_id = :sourceTagId AND (node_type, node_id) IN (SELECT node_type, node_id FROM tag_assignments WHERE tag_id = :targetId)`
   — drops the source's assignment wherever the node already carries the target tag too (the
   dedupe case), so the next statement never violates `tag_assignments_tag_node_unique`.
4. `UPDATE tag_assignments SET tag_id = :targetId WHERE tag_id = :sourceTagId` — the remainder.
5. `UPDATE probe_sessions SET scope_id = :targetId WHERE scope = 'tag' AND scope_id = :sourceTagId`
   — without this, an active or historical tag-scoped session becomes silently unreachable (not
   deleted, just orphaned from `getActiveSessionRow`'s `(scope, scopeId)` lookup) the moment its
   tag is merged away.
6. `DELETE FROM tags WHERE id = :sourceTagId`.
7. Commit. Return `{ targetTagId, sourceTagId, assignmentsMoved: number, assignmentsDeduped: number, sessionsMoved: number }`.

## Frontend

- `apps/web/src/subject/subject-section.tsx` — new `MergeSubjectButton` component, same
  confirm-arm interaction pattern already used by `DeleteSubjectButton` in this file. Click reveals
  a `<select>` of eligible target subjects (every OTHER subject with `kind === "architecture-mentor"`
  — excludes itself and excludes any `language-practice` subject at the UI level, defense-in-depth
  alongside the backend 400) + Confirm/Cancel. `SubjectSection` needs a new `allSubjects: Subject[]`
  prop (the full list, already in scope in `HomeView`) to build this dropdown.
  **Verified placement detail**: the card's header block (`<h2>` + `DeleteSubjectButton`, lines
  ~20-31 of the current file) renders unconditionally, ABOVE the `subject.kind ===
  'language-practice'` ternary that branches the card's body (Open-practice link vs.
  curricula list) further down. `MergeSubjectButton` must NOT simply sit next to
  `DeleteSubjectButton` inside that same unconditional block — that would render it for
  language-practice subjects too, contradicting Scenario 2. It needs its own conditional,
  `subject.kind === 'architecture-mentor' ? <MergeSubjectButton .../> : null`, placed in that
  header block alongside — not inherited from — the existing body-level kind branch.
- `apps/web/src/subject/subject.api.ts` — new `mergeSubjects` server function
  (`createServerFn({ method: 'POST' })`, matches `deleteSubject`'s existing shape).
- `apps/web/src/routes/index.tsx` — `TagList` gets a small merge affordance per tag chip (same
  confirm-arm pattern), picking a target tag from the same list minus itself.
- `apps/web/src/curriculum/curriculum.api.ts` (where `listTags`/`assignTag` already live) — new
  `mergeTags` server function.

## Files to create

```
packages/shared/src/
  subject.ts        — + mergeSubjectsInput schema
  tag.ts             — + mergeTagsInput schema
```

## Files to modify

```
apps/api/src/
  db/schema.ts                              — no change (documented for clarity: no migration needed)
  subject/subject.repo.ts                   — + mergeSubjects(targetId, sourceId)
  subject/subject.controller.ts             — + handleMergeSubjects
  tag/tag.repo.ts                           — + mergeTags(targetId, sourceId)
  tag/tag.controller.ts                     — + handleMergeTags
  router.ts                                 — + POST /subjects/:id/merge, POST /tags/:id/merge

apps/web/src/
  subject/subject-section.tsx               — + MergeSubjectButton, + allSubjects prop
  subject/subject.api.ts                    — + mergeSubjects server fn
  curriculum/curriculum.api.ts              — + mergeTags server fn
  routes/index.tsx                          — TagList gets merge affordance; HomeView passes
                                               allSubjects to SubjectSection

packages/shared/src/
  subject.ts                                — + mergeSubjectsInput
  tag.ts                                     — + mergeTagsInput
```

## Decisions made autonomously

1. **Scope: merge only, no split, for this pass.** Merge is a strict reassignment (every child has
   exactly one correct new owner, determined mechanically). Split requires a judgment call about
   which children go to which new piece — genuinely harder, genuinely riskier, and the issue's own
   live, real-world example today (the Webdev duplicate) is a merge case. Building split well
   deserves its own planning pass once merge's reassignment machinery exists to build on.
2. **Scope: Subject + Tag merge only, Curriculum (course) merge deferred.** Enumerated by grep
   (see discussion.md), a Curriculum's real child set spans 8 unbacked-by-FK table families
   (`sources`, `modules`/`topics`/`gaps`, `curriculum_structure_turns`, `structure_research_candidates`,
   `probe_sessions`, `socratic_sessions`, `lectures`, `llm_call_events`) versus 2 for Subject
   (`curricula`, `domain_nodes`) and 2 for Tag (`tag_assignments`, `probe_sessions`-when-tag-scoped).
   The issue's Done-when is a disjunction ("Subject, course, **or** tag") — Subject+Tag merge
   satisfies it; this is a stated, reasoned narrowing, not a silent one.
3. **Subject merge restricted to `kind: "architecture-mentor"` on both sides.** Verified there is
   no `updateSubject`/rename endpoint anywhere in `subject.repo.ts` — `kind` is immutable after
   creation, which is what makes this guard a permanent boundary rather than a snapshot-in-time
   check that could be invalidated later. Language-practice subjects (only "English" exists today)
   carry `phrases`, `phrase_bank_entries`, `attempts`, `writing_checks` (all keyed by `subjectId`,
   no FK) and — critically — `language_practice_settings`, whose `subjectId` is its **primary key**
   (exactly one settings row per subject). Merging two language-practice subjects requires deciding
   whose settings/mastery-cycle state survives on conflict — a genuine judgment call with no safe
   default. Deferred as fast-follow rather than guessed at.
4. **`deleteSubject()` is not reused for the source-row delete.** That existing repo function
   cascades into `deleteCurriculum()` for every curriculum still owned by the subject — safe today
   only because nothing reparents children first. Reusing it here, after this merge has already
   reassigned those same curricula away, would delete the very data the merge just moved. The merge
   uses a direct `DELETE FROM subjects WHERE id = ...` instead. (Side finding, not fixed here:
   `deleteSubject()` already silently orphans that subject's `domain_nodes` today — pre-existing,
   out of scope for this plan, worth its own fast-follow.)
5. **No domain-node cycle guard is added.** A debrief on the prior item found
   `domain-map.repo.ts`'s tree-assembly recursion has no cycle guard, unlike the percentage-rollup
   deriver beside it. Verified this plan never re-parents a `domain_node` — subject merge moves the
   whole forest by changing `subject_id` only; every `parent_id` write site was grepped and
   confirmed to only fire at node-creation time. The missing guard is therefore not exercised by
   anything this plan builds. Recorded here as a verified fact, with an explicit flag: the eventual
   split fast-follow WILL need to re-parent subtrees and MUST add the cycle guard (or validate the
   new parent isn't a descendant of the node being moved) before it ships.
6. **Concurrency: the merge's own transaction is fully locked; the `createCurriculum`-vs-merge race
   is documented, not closed, in this pass.** `mergeSubjects`/`mergeTags` acquire
   `pg_advisory_xact_lock` for both ids (sorted, to prevent cross-merge deadlock) before
   reassigning, and re-check existence *after* acquiring the lock — this fully closes merge-vs-merge
   races (Scenario 5) and any partial-write risk within the merge's own multi-statement sequence.
   The one race NOT closed: `resolveDomainPlacement`/`createCurriculum` (verified, by reading both
   in full, to run as two separate un-transacted, unlocked statements today) could still insert a
   curriculum or domain_node under the source subject id in the narrow window between the merge's
   reassignment UPDATE and its DELETE. Fully closing this requires restructuring
   `resolveDomainPlacement` + `createCurriculum` into one transaction carrying the same advisory
   lock — a genuine three-file refactor of a hot, currently-working, frequently-exercised write
   path. Given (a) this is a single-user personal app, (b) the trigger requires the same operator
   to fire "merge this subject" and "create a curriculum under the subject being merged away"
   within the same sub-second window, and (c) this project's own precedent
   (`phrase-bank-concurrency-fix`) shipped its primary fix and logged a remaining deadlock-window
   edge as a separate wishlist item rather than blocking on full closure — this plan does the same:
   ship the closed merge-vs-merge case now, log "extend the advisory lock to `createCurriculum`'s
   write path" as a fast-follow.
7. **Merge direction is target-survives, source-absorbed, chosen from the absorbed entity's own
   card/chip.** Clicking "merge" on subject/tag X opens a picker of what X merges *into* — X is
   always the source, the picked entity is always the target. This reads naturally as "get rid of
   this duplicate by folding it into that one," matching how the real Webdev/Programming-Web-Dev
   scenario is actually described (decide which name survives, fold the other one in).

## Definition of Done — per layer

**Backend.**
- `npx vitest run -w @post-anki/api` clean.
- Real `curl` + direct-SQL sequence against a running local API + local Postgres proves the
  reassignment, not just a 200. Every step below was checked against the real route table
  (`apps/api/src/router.ts`) and `curriculum.repo.ts`/`curriculum.controller.ts` — no step invents
  an endpoint that doesn't exist:
  1. `POST /subjects` twice (e.g. `{name: "Webdev"}`, `{name: "Programming / Web Development"}`).
  2. `POST /curricula` under the "Webdev" subject with a `docUrl` pointed at the e2e stack's
     `mock-docs-site` fixture; poll `GET /curricula/:id` until `status: 'awaiting_source_approval'`;
     `POST /curricula/:id/approve-sources {override: true}`; poll until `status: 'ready'` — at
     which point `modules`/`topics` are real, populated rows (verified via the already-passing
     `study-technology-doc-url` e2e test, which proves this exact sequence). This is the correct
     mechanism, not a shortcut: `curriculum.$curriculumId.tsx`'s `editable` flag
     (`status === 'ready' || status === 'confirmed'`) gates both the manual add-module UI and the
     tag-assignment control, so a freshly-created curriculum (`status: 'curating'`) has neither
     reachable — a plain `POST /curricula` alone would not produce a taggable module. Then
     `POST /tags` + `POST /tags/:id/assignments` to tag one of the real modules. Separately, a
     **direct SQL insert**
     into `domain_nodes` (`subject_id = webdevId, parent_id = null, name = 'Backend'`) — verified
     there is no HTTP creation path for a `domain_nodes` row independent of the
     agent-driven `resolveDomainPlacement` flow inside `POST /curricula`; a direct insert is the
     correct, honest way to set up this precondition, not a workaround. Then a second
     `POST /curricula` with `domainNodeId` set to that inserted node's id, to place a curriculum
     on it directly.
  3. `POST /subjects/:programmingId/merge { sourceSubjectId: webdevId }`.
  4. `GET /curricula?subjectId=:programmingId` (verified this endpoint accepts and filters by the
     `subjectId` query param — `handleListCurricula`/`server.ts`'s
     `url.searchParams.get("subjectId")`) — both curricula created under "Webdev" now appear here.
  5. `GET /subjects/:programmingId/domain-map` — the "Backend" node originally under "Webdev" now
     appears in this tree, still holding its placed curriculum.
  6. `GET /subjects` (there is no `GET /subjects/:id` route — verified against `router.ts`) — the
     response array no longer contains `webdevId`.
  7. `GET /curricula/:id` for the tagged curriculum (verified `getCurriculumDetail` attaches
     `tags: TagChip[]` per module via `listAssignmentsForNodes` — confirmed in
     `curriculum.repo.ts`) — the module's tag is still present, unchanged, proving by direct
     observation (not just absence of an error) that the merge never touched `tag_assignments`.
  8. **Zero-orphan proof** — a direct SQL check (`SELECT count(*) FROM curricula WHERE subject_id =
     :webdevId` and `SELECT count(*) FROM domain_nodes WHERE subject_id = :webdevId`, both
     expected 0) run against the local Postgres instance. The e2e test for Scenario 1 proves the
     equivalent fact through the confirmed, already-used-in-this-project `rowExists` helper from
     the verification repo's `db` lib (`rowExists('curricula', { subject_id: webdevId }) === false`
     and the same for `domain_nodes` — mirrors `features/subject/tests/add-subject/test.ts`'s
     existing `rowExists('subjects', { name })` usage exactly).
  9. Repeat an equivalent sequence for tag merge: two tags, one shared node tagged with both
     (dedupe path) plus one node tagged with only the source (plain-move path), an active
     `probe_sessions` row with `scope: "tag", scopeId: sourceTagId` (inserted directly via SQL,
     since there is no HTTP path to create a `probe_sessions` row with an arbitrary pre-set scope
     for test setup). After merge: `GET /tags` no longer lists the source tag; `GET /curricula/:id`
     for the double-tagged topic's curriculum shows exactly one tag chip for that topic (not two);
     the plain-move node's tag chip now shows the target tag; direct SQL confirms
     `SELECT count(*) FROM tag_assignments WHERE tag_id = :sourceTagId` = 0 and the seeded
     `probe_sessions` row's `scope_id` column now reads the target tag id.
- Integration test (real Postgres, mirrors `phrase-bank-concurrency-fix`'s existing pattern) proves
  the double-merge race: two concurrent `POST /subjects/:targetId/merge {sourceSubjectId}` calls
  for the *same* source — one succeeds (curricula/domain_nodes moved, source gone), the other
  returns a clean 404, never a 500 and never a partially-moved state. Exact scenario tag:
  `@ontology-split-merge.S5`.

**Frontend.** e2e proof, exact scenario tags (see scenarios.md for full narrative):
- `@ontology-split-merge.S1` — merging two subjects with real children (a curriculum, a
  domain-node-placed curriculum, a tagged module) via the UI reassigns every child, none orphaned
  or duplicated, verified both in the DOM (curriculum now listed under the surviving subject's
  card, domain map shows the moved node) and via a direct DB read (`rowExists`/`getRow` against
  `curricula`, `domain_nodes`).
- `@ontology-split-merge.S2` — the merge-target picker never offers the subject itself or a
  `language-practice`-kind subject as a valid merge target.
- `@ontology-split-merge.S3` — merging two tags, including the same-node-double-tag dedupe case,
  reflected live in the tag chips on the module/topic rows.

**Infrastructure.** N/A — no schema migration, no new service, no env var, no deploy change.

## Documentation changes

No existing `docs/architecture/*.md` covers subject/tag lifecycle management (verified — no file
named anything like `subject-lifecycle` or `ontology` exists under `docs/architecture/`). This plan
commits to publishing `docs/architecture/ontology-split-merge.md` during implementation, containing
the merge procedure diagrams already drafted in `architecture.md` — the child-reassignment flow and
the advisory-lock sequencing.
