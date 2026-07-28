---
type: playwright
branch: ontology-split-merge
task: ontology-split-merge
state: confirmed
target-project: post-anki
target-feature: features/subject (S1, S2), features/tag (S3, new)
actions-snapshot-date: 2026-07-28
updated: 2026-07-28
---

# Playwright readiness — Subject and Tag merge

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — A duplicate subject (the real production "Webdev" / "Programming / Web Development" case)
  can be folded into one, and everything that was under the duplicate — its courses, its topic-map
  placement, its tags — keeps working exactly as before, just under the surviving name. → S1
- B2 — The app refuses to let a merge create a nonsensical state (merging a subject into itself, or
  mixing an architecture-mentor subject with a language-practice one) before it ever reaches the
  database. → S2
- B3 — Two near-duplicate tags (e.g. "react" / "reactjs") can be folded into one without losing
  which topics were tagged, and without a topic ending up double-tagged with the same concept. → S3

**UX scenarios**
- U1 — From a subject's card on the home page, the user picks another subject to merge into and
  confirms; the duplicate card disappears, its content reappears under the survivor. → S1
- U2 — The merge picker's dropdown only ever shows valid targets — never the subject itself, never
  a language-practice subject. → S2
- U3 — From the tag list on the home page, the user picks a target tag to merge a duplicate into;
  the duplicate disappears from the list and every place it was chip-rendered now shows the
  survivor instead. → S3

(Each B/U item links to its detailed S-row in the mapping below.)

**Not e2e (verified at backend/integration only)**
- S4 — tag merge reassigning an active tag-scoped probe session's `scope_id` — no independently
  meaningful UI surface beyond what S3 already covers for the assignment reassignment itself;
  proving it through a full quiz-taking flow just to exercise one column update is disproportionate.
  Verified via a real-Postgres integration test instead.
- S5 — two concurrent merges racing for the same source subject — the interleaving can't be
  reliably constructed by browser clicks; verified via a real-Postgres integration test firing two
  concurrent function/HTTP calls directly, mirroring `phrase-bank-concurrency-fix`'s existing
  pattern for the same class of proof.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/subject/` (S1, S2 — merge lives on the subject card); new `features/tag/`
  (S3 — no tag feature folder exists yet in the action catalog)
- Target DB: `post-anki-e2e` (local Docker Postgres, :5436 — per `project.json`, this project never
  touches Neon/prod)
- Dev server URL: `http://localhost:3100` (web), API `http://localhost:8031`

## Action surface — snapshot

`features/subject/actions/index.ts` re-exports: `createSubject` (from `create-subject.action.ts`)
— params `{ page, name, description?, requireSources?, kind? }`, drives the home page's
create-subject form, confirms via `GET /subjects` after submit. This is the only subject action
today; there is no `deleteSubject` or any merge action yet.

`features/domain-map/actions/index.ts` re-exports: `openDomainMapPage`,
`createCurriculumByName`, `addCourseUnderNode`, `changePlacement` — all reusable as-is for S1's
setup (attaching a curriculum under a domain node before merging).

`features/tag/` does not exist yet as a feature folder — S3 needs one created from scratch (no
existing tag actions to reuse for assign/create, since today's tag assignment happens inline via
`TagPicker` on module/topic rows, not through a dedicated action; S3's action gap list below covers
this).

`features/curriculum/actions/index.ts` re-exports `studyTechnology` — reused directly for S1/S3's
module/topic setup (see the "Corrected mechanism" note under S1 below); no new action needed for
that half of either scenario.

`lib/`: `ActionFailure` (missing-testid / message failures), `waitForHydration`, `captureProof`,
`pauseForHuman` — used identically to `create-subject.action.ts`'s existing shape for every new
action below.

## Scenario → action + state + testid map

### S1 — Merge two subjects with real children, none orphaned or duplicated

**Composes actions:** `createSubject` (×2 — "Webdev" and "Programming / Web Development"),
`studyTechnology` (EXISTING action, `features/curriculum/actions/study-technology.action.ts`,
params `{ page, name, docUrl, level? }` — drives the docUrl-based curriculum creation flow against
the existing `mock-docs-site` fixture), `addCourseUnderNode` (EXISTING action, from
`features/domain-map/actions`, params `{ page, subjectId, nodeId, name }`, drives the domain-map
tree UI's own "add course here" affordance — used as-is for the domain-placed curriculum half of
this scenario), `openDomainMapPage` (reused post-merge to verify the moved node).

**Corrected mechanism for getting a real, taggable module (supersedes an earlier draft of this
plan that assumed a manual "add module" UI was reachable immediately after curriculum creation).**
Verified two facts by reading the actual code, not assuming: (1) `apps/web/src/routes/curriculum.$curriculumId.tsx`
computes `editable = curriculum.status === 'ready' || curriculum.status === 'confirmed'`, and BOTH
`ModuleSection`'s manual add-module/add-topic controls AND `TagPicker`'s "+ tag" control are gated
on that same `editable` prop — a freshly created curriculum starts at `status: 'curating'`, so
neither control exists yet. (2) The already-passing test
`features/curriculum/tests/study-technology-doc-url/test.ts` proves the real, established path to
`status: 'ready'` with real, populated `modules`: `studyTechnology` (docUrl against
`mockDocsSiteBaseUrl()`) → poll `GET /curricula/:id` until `status: 'awaiting_source_approval'` →
`POST /curricula/:id/approve-sources { override: true }` → poll until `status: 'ready'` — at which
point `GET /curricula/:id`'s `modules` array is already populated (the draft-structure generation
against the mock docs site produces real module/topic rows by the time `ready` is reached; no
separate `confirm-structure` call is needed for the docUrl entry point, confirmed by that test
never making one). S1 (and S3) reuse this exact, already-proven sequence via Playwright's `request`
fixture directly in the test body (matching that test's own style — not wrapped in a new action,
since it's request-only polling, not a UI interaction) to get "Webdev"'s tagged curriculum to
`ready`, then read a real `moduleId` off the response to hand to the tag actions below.

**Seed helper reused (back door, not an action):** a `domain_nodes` "Backend" row is inserted
directly via SQL, following `features/domain-map/seeds/seed-domain-map-fixture.ts`'s existing
`insertDomainNode`-via-`insertRow` pattern exactly — verified `domain_nodes` has no HTTP creation
path independent of the agent-driven placement flow inside curriculum creation. This is the ONLY
back-door entity in S1 — the curriculum placed on it (via `addCourseUnderNode`) does not need to
reach `ready` status for this scenario's assertions (`getDomainMapForSubject`'s `placedCurricula`
query filters only on `isNotNull(domainNodeId)`, no status condition — confirmed by reading
`domain-map.repo.ts` in full), so it stays at whatever status `addCourseUnderNode` leaves it at.

**Action gaps:**
- `mergeSubject({ page, sourceSubjectName, targetSubjectName }): Promise<{ sourceSubjectId: string; targetSubjectId: string }>`
  — new, `features/subject/actions/merge-subject.action.ts`. Opens the source subject's merge
  control, selects the target by visible name in the `<select>`, clicks confirm, waits for the
  source card to be removed from the DOM, resolves both ids via a `GET /subjects` lookup (mirrors
  `createSubject`'s own post-submit id-resolution pattern).
- `assignTagToModule({ page, moduleId, tagName }): Promise<{ tagId: string }>` — new,
  `features/tag/actions/assign-tag.action.ts` (see S3 for the fuller tag action set this shares).
  Drives `TagPicker`'s existing `tag-picker-open-<nodeId>` / `tag-picker-input-<nodeId>` /
  `tag-picker-submit-<nodeId>` testids (already instrumented, per `tag-picker.tsx`) — called only
  after the owning curriculum has reached `ready`/`confirmed` (see above), never before.

**Pre-test state:** `baseline-only` for the subjects (created in-test — no seed provides "Webdev",
verified `apps/api/scripts/seed-subjects.ts` seeds only "Programming / Web Development"); the
curriculum/domain-node/tag content under "Webdev" is also created in-test via the actions above
(not seeded), since exercising the real creation paths is exactly what proves nothing was
orphaned by the merge that follows.

**Required `data-testid` attributes:**
- `subject-merge-button-<subjectId>` — opens the merge picker on a subject card
- `subject-merge-target-select-<subjectId>` — the target `<select>`
- `subject-merge-confirm-<subjectId>` / `subject-merge-cancel-<subjectId>`

**Fixture variants:** none — all state is created via actions in-test, no generated file fixtures
needed for this scenario.

**Vision check candidate:** no (structural DOM + DB assertions suffice).

---

### S2 — Merge-target picker excludes invalid targets

**Composes actions:** `createSubject` (×3 — two `architecture-mentor`, one
`kind: 'language-practice'`).

**Action gaps:**
- `openMergePicker({ page, subjectId }): Promise<{ optionLabels: string[] }>` — new, opens the
  merge control and reads back the `<select>`'s option list as visible text, for the exclusion
  assertion. `features/subject/actions/merge-subject.action.ts` (co-located with `mergeSubject`
  from S1 — same file, two exports).

**Pre-test state:** `baseline-only`, all three subjects created in-test.

**Required `data-testid` attributes:** same as S1 (`subject-merge-button-*`,
`subject-merge-target-select-*`); no new ones.

**Fixture variants:** none.

**Vision check candidate:** no.

---

### S3 — Merge two tags, including the same-node-double-tag dedupe case

**Composes actions:** `createSubject`, `studyTechnology` (EXISTING action — same
docUrl-against-mock-docs-site + approve-sources-override + poll-to-`ready` sequence documented
under S1 above, reused here to get a real module AND topic to tag; `study-technology-doc-url`'s
own `CurriculumDetail.modules[].topics` shape confirms both are present in the same `ready`
response).

**Action gaps:**
- `createTag({ page, name }): Promise<{ tagId: string }>` — new,
  `features/tag/actions/create-tag.action.ts`. Drives the existing `TagPicker` "+ tag" control
  (already carries `tag-picker-open-<nodeId>` / `tag-picker-input-<nodeId>` /
  `tag-picker-submit-<nodeId>` testids per `apps/web/src/curriculum/tag-picker.tsx`, confirmed by
  reading that file — no new FE testids needed for tag creation/assignment itself). Called only
  once the owning curriculum is `ready`/`confirmed` (see S1's editable-gating finding — applies
  identically here).
- `mergeTag({ page, sourceTagName, targetTagName }): Promise<{ sourceTagId: string; targetTagId: string }>`
  — new, `features/tag/actions/merge-tag.action.ts`. Opens the source tag chip's merge control in
  the home page's tag list, selects the target, confirms, waits for the source chip to disappear
  from `[data-testid="tag-list"]`.

**Pre-test state:** `baseline-only`, all entities (subject, curriculum, module, topic, both tags,
both assignments) created in-test via actions — this scenario's whole point is proving the
assignment-reassignment path, so seeding around it would test nothing.

**Required `data-testid` attributes:**
- `tag-list-merge-button-<tagId>` — per-chip merge affordance in the home page's tag list
- `tag-list-merge-target-select-<tagId>` / `tag-list-merge-confirm-<tagId>` /
  `tag-list-merge-cancel-<tagId>`
- Existing, reused: `tag-picker-*` (already instrumented, per `tag-picker.tsx`), `tag-chip-<tagId>`
  (already instrumented — used to assert the double-tagged topic shows exactly one chip
  post-merge).

**Fixture variants:** none.

**Vision check candidate:** no.

---

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `mergeSubject` | S1, S2 | No — single-purpose, ticket-local flow |
| `openMergePicker` | S2 | No |
| `assignTagToModule` | S1, S3 | No |
| `createTag` | S3 | No |
| `mergeTag` | S3 | No |

No new action was needed to reach a taggable module/topic — `studyTechnology` (existing) plus the
already-proven approve-sources-override-and-poll sequence from `study-technology-doc-url/test.ts`
covers it, corrected mid-planning after verifying `editable`'s actual gating condition (see S1's
"Corrected mechanism" note above).

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | baseline-only | Everything created in-test — no seed provides the "Webdev" duplicate |
| S2 | baseline-only | Three subjects created in-test |
| S3 | baseline-only | Everything created in-test |
| S4 (backend-only) | n/a — integration test, not e2e | Seeds a `probe_sessions` row directly via SQL in the test setup |
| S5 (backend-only) | n/a — integration test, not e2e | Seeds two subjects + one curriculum + one domain_node directly via SQL |

## Open questions

None carried forward — every fork this plan needed to resolve had a settled answer before writing
scenarios.md (see spec.md's "Decisions made autonomously").
