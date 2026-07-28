---
type: discussion
branch: ontology-split-merge
state: confirmed
updated: 2026-07-28
---

# Discussion log — ontology-split-merge

## Source

- Wishlist item 6 in `.planning/wishlist.md`'s "Active build queue": "Manage the ontology over
  time — split or merge subjects/courses/tags."
- GitHub issue #56 (full body pulled via `gh issue view 56 --json`), labels `type:story`,
  `priority:low`, state OPEN.
- Real production example named in both: a pre-existing "Webdev" subject and the newly-seeded
  "Programming / Web Development" subject (from `.planning/seed-knowledge-map/`, merged to main
  this run) sitting as near-duplicates.

## Codebase research performed before planning

Read in full: `apps/api/src/db/schema.ts`, `apps/api/scripts/seed-subjects.ts`,
`apps/api/src/subject/subject.repo.ts` + `subject.controller.ts`,
`apps/api/src/domain-map/domain-map.repo.ts`, `apps/api/src/tag/tag.repo.ts`,
`apps/api/src/router.ts`, `apps/web/src/subject/subject-section.tsx` + `subject.api.ts`,
`apps/web/src/routes/index.tsx`, `apps/web/src/routes/admin-settings.tsx`,
`apps/web/src/curriculum/tag-picker.tsx`, `.planning/seed-knowledge-map/architecture.md` +
`spec.md` + `e2e-tests.md`, `.planning/grounded-knowledge-map/spec.md`.

**Verified fact: `apps/api/scripts/seed-subjects.ts` seeds only "Programming / Web Development"
— not "Webdev".** The duplicate is a real production artifact, not present in any dev/seed/e2e
fixture. Any e2e test for this feature must create both subjects itself.

### Child-table enumeration — done by grep, not by reading `schema.ts` column names alone

This schema has almost no foreign keys (confirmed while reading `schema.ts` — most cross-table
references are plain `text` columns with app-level validation, not `.references()`). An advisor
review of the initial plan draft flagged that inferring "what points at a Subject" or "what points
at a Tag" from column names risks missing polymorphic references. Ran:

```
grep -rln "subjectId\|subject_id" apps/api/src apps/bot/src packages/ --include="*.ts" | grep -v .test.ts
grep -rln "tagId\|tag_id" apps/api/src apps/bot/src packages/ --include="*.ts" | grep -v .test.ts
grep -rn "\"subject\"\|'subject'\|nodeType.*subject" apps/api/src packages/ --include="*.ts" | grep -v .test.ts
grep -n "probeScopeSchema\|ProbeScope" packages/shared/src/probe-session.ts
grep -n "NodeType" packages/shared/src/tag.ts    # → re-exports node-feedback's nodeTypeSchema
grep -n "nodeTypeSchema" packages/shared/src/node-feedback.ts
grep -n "itemType" apps/api/src/feedback/feedback.controller.ts packages/shared/src/feedback.ts
```

Findings that shaped the design:

- `probeScopeSchema = z.enum(["module", "topic", "tag"])` — **never `"subject"`.** Subject merge
  does not need to touch `probe_sessions` at all.
- `nodeTypeSchema = z.enum(["module", "topic"])` (defined in `packages/shared/src/node-feedback.ts`,
  re-used by `tag.ts` for `tag_assignments.nodeType`) — **never `"subject"` or `"curriculum"`.**
  `tag_assignments` and `node_feedback` never reference subjects. Module/topic ids are stable
  across a subject reassignment (only their owning curriculum's `subject_id` changes), so tag
  assignments and node feedback need zero changes on subject merge.
- `study_item_feedback.itemType` is `"probe_question" | "socratic_turn"` only — never
  subject/tag-related.
- `probe_sessions.scope_id` DOES hold a tag id when `scope = "tag"` (verified in
  `probe-session.repo.ts`'s `getActiveSessionRow`/`getTagScopeContext`) — this is the one real
  orphan risk a naive tag-merge-by-column-name-grep would have missed. Folded into the tag merge
  design (reassign `scope_id` alongside `tag_assignments.tag_id`).
- Every write site for `domain_nodes.parent_id` (`domain-map.repo.ts`'s `insertDomainNode`,
  `domain-placement.orchestrator.ts`'s node-creation call) sets it only at node-creation time,
  never on an existing row. This plan's subject-merge design (move the whole `domain_nodes` forest
  by changing `subject_id` only, `parent_id` untouched) does not add a new write site either — see
  "Cycle-guard finding" below.

### Cycle-guard finding (relayed mid-planning, addressed)

A debrief of the prior item (seed-knowledge-map) found `domain-map.repo.ts`'s tree-assembly
recursion (`getDomainMapForSubject`'s `buildItem`) has no cycle guard, unlike the percentage-rollup
deriver next to it (`domainNodeProgress` in `packages/core/src/domain-map/domain-map-progress.ts`,
which has a visited-set + depth cap of 6). It was safe in v1 because nothing re-parents a
`domain_node` after creation.

**Verified this plan does not add a re-parenting path.** Subject merge changes
`domain_nodes.subject_id` for every row belonging to the source subject — `parent_id` is never
touched, so the tree topology of the moved forest is preserved exactly; it just becomes an
additional set of root(s) under the target subject (already supported by
`getDomainMapForSubject`'s `nodeRows.filter(row => row.parentId === null)`, confirmed by reading
that function in full — no code change needed there). The missing cycle guard is therefore **not
exercised by anything built in this plan.** This is recorded as a verified fact in `spec.md`'s
scope boundary, with an explicit flag that the future split fast-follow (which WILL need to
re-parent subtrees, e.g. moving a subtree to a newly-split-off subject) must add the cycle guard —
or validate the new parent isn't a descendant of the node being moved — before it ships.

### `createCurriculum`/domain-placement write path — read to design the concurrency lock

Read `curriculum.controller.ts`'s `handleCreateCurriculum` (lines ~139-151) and
`curriculum.repo.ts`'s `createCurriculum` (lines ~106-138) in full. Confirmed:
`resolveDomainPlacement` (which may call `insertDomainNode`) runs, then `createCurriculum` runs —
as two separate, **not currently transactional**, un-locked statements against `getDb()`. Neither
is wrapped in a `db.transaction()` today.

This is the real write path a concurrent subject merge could race against (a new curriculum or
domain node landing under the source subject id after merge's reassignment UPDATE but before its
DELETE). Fully closing this race would require restructuring `resolveDomainPlacement` +
`createCurriculum` into one transaction carrying a `pg_advisory_xact_lock(hashtext(subjectId))` —
a genuinely invasive three-file refactor (`domain-placement.orchestrator.ts`, `domain-map.repo.ts`,
`curriculum.repo.ts`) of a hot, frequently-exercised, currently-working path, for a race that
requires the single app operator to fire "merge this subject" and "create a curriculum under the
subject being merged away" within the same few-hundred-millisecond window. See spec.md's
"Decisions made autonomously" for the resulting scope call (lock the merge's own multi-statement
sequence fully; document, don't build, the createCurriculum side; log as fast-follow) — this
mirrors the project's own established precedent from `phrase-bank-concurrency-fix`, which shipped
its primary fix and logged the remaining deadlock-window edge as a separate wishlist item rather
than blocking the original fix on full closure.

### Transaction precedent verified

`grep -rn "\.transaction(" apps/api/src --include="*.ts"` → used at
`apps/api/src/practice/grade-attempts.orchestrator.ts:230` and
`apps/api/src/practice/generate-phrase-batch.orchestrator.ts:164` (both
`getDb().transaction(async (tx) => {...})`). This plan's `mergeSubjects`/`mergeTags` reuse this
exact pattern — it is the house style, not an invention.

### UI placement verified

`apps/web/src/routes/index.tsx`'s `HomeView` renders every `SubjectSection` in a list (the home
page) and a separate `TagList` component (same file, lines 23-53) listing every tag as a link to
`/probe/tag/$tagId`. `apps/web/src/routes/admin-settings.tsx` is a single placeholder toggle with
no relevant surface — rejected as the merge UI's home; the two duplicate subjects are visible
side-by-side on the actual home page, which is where a merge picker is usable "from the app
itself" in the way the issue means it.

### Verification-repo registration confirmed

`/Users/ikushlianski/work/verification-repo/projects/post-anki/post-anki/project.json` exists —
post-anki is verification-registered. Stack: TanStack Start (web) + Node/Express API, Postgres
(local Docker for e2e on :5436, Neon in prod), e2e via `apps/*/e2e` → `dev:pw`. Read the existing
`subject` feature folder (`create-subject.action.ts`, `seeds/baseline.ts`) and `domain-map` feature
folder (flat `tests/<scenario-slug>.test.ts`, tags `@e2e @<slug> @<slug>.S<N>`) to confirm the
real, current test-tagging and action-file convention — matches what the wishlist/task briefing
described from `.planning/seed-knowledge-map/e2e-tests.md`.

## Advisor pass (before writing plan files)

Ran `advisor()` after completing codebase research but before drafting spec.md. Verdict: design
sound (merge-only scope, whole-forest-move, tags-untouched-because-node-ids-don't-change all
correct). Flagged: (1) the polymorphic/no-FK child-enumeration gap — addressed above via targeted
greps; (2) do not reuse `deleteSubject()` for the source-row delete (it cascades into
`deleteCurriculum` for every owned curriculum — safe today only because nothing reparents first);
(3) verify a transaction precedent exists before assuming the house style — confirmed above; (4)
record a concurrency decision explicitly rather than staying silent; (5) the e2e must build its own
duplicate-subject fixture since seed data doesn't provide "Webdev"; (6) `kind` immutability
(no update-subject endpoint) is the load-bearing fact behind the architecture-mentor-only guard —
confirmed by grep, no `updateSubject` function exists anywhere in `subject.repo.ts`; (7) UI stays
on the subject card, not admin-settings.

All five points are folded into the design above and into spec.md/architecture.md.
