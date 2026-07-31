---
type: playwright
branch: curriculum-merge
task: curriculum-merge
state: confirmed
target-project: post-anki
target-feature: features/curriculum
actions-snapshot-date: 2026-07-31
updated: 2026-07-31
---

# Playwright readiness — Curriculum merge

## E2E scenarios for review (business + UX) — read first

**Business scenarios**
- B1 — Two curricula that turned out to cover the same material (created independently, at
  different times, under the same subject) can be combined into one, with every module, topic,
  tag, and source from both preserved — nothing has to be manually recreated or lost. → S1
- B2 — The merge picker for a curriculum only ever suggests other curricula that actually belong to
  the same subject, so there's no way to accidentally fold one subject's content into an unrelated
  one. → S2

**UX scenarios**
- U1 — On the home page, each curriculum row gets a "Merge into…" control (matching the existing
  "Delete curriculum" button's style and placement). Clicking it reveals a dropdown of the other
  curricula under the same subject; picking one and confirming makes the picked-from curriculum's
  row disappear, and its content now shows up under the curriculum that was kept. → S1
- U2 — Opening the merge picker on a curriculum that has no siblings under its subject shows no
  usable target — there's nothing to merge into yet. → S2

**Not e2e (verified at unit/integration only)**
- S3 (double-merge race) — proving the database lock serializes two simultaneous merge requests is
  a database-level property; a browser can't reliably construct two requests landing in the same
  few-millisecond window, and doing so wouldn't demonstrate anything a direct concurrent-HTTP-call
  integration test doesn't already prove more precisely.
- S4 (pending-structure-turn precondition) — reliably landing a real curriculum in the exact
  `role='assistant', status='pending'` window via browser clicks against the mocked LLM would be
  flaky by construction (the mock resolves fast, so a UI-driven attempt would race it every run); a
  direct SQL seed of that exact row shape is the deterministic way to prove this precondition.

## Target

- Project: `post-anki` (`verification-repo/projects/post-anki/post-anki/`)
- Feature: `features/curriculum/` (S1, S2 — new actions live here, alongside `study-technology.action.ts`)
  — cross-referencing `features/subject/` for the `subject-section.tsx` UI surface both actions drive
- Target DB: `post-anki-e2e` (local Docker Postgres, `:5436`, per `project.json`)
- Dev server URL: `http://localhost:3100`

## Action surface — snapshot

Actions available at planning time, reused by this plan's scenarios:

- `createSubject` (`features/subject/actions/create-subject.action.ts`)
- `studyTechnology` (`features/curriculum/actions/study-technology.action.ts`) — creates a
  curriculum via docUrl, waits for it to appear in the subject's list
- `assignTagToModule` (`features/tag/actions/assign-tag.action.ts`, exported from
  `features/tag/actions`)
- `mergeSubject` / `openMergePicker` (`features/subject/actions/merge-subject.action.ts`) — direct
  template for this plan's two new action gaps below, not reused directly (curriculum rows, not
  subject cards)

Not reused, but read as the exact precedent for the API-polling sequence S1 needs:
`features/subject/tests/merge-subjects-full-reassignment.test.ts`'s
`approve-sources` → poll `shaping_structure` → `confirm-structure` → poll `ready` sequence.

## Scenario → action + state + testid map

### S1 — Merging two curricula with real children reassigns every one, none orphaned or duplicated

**Composes actions:** `createSubject`, `studyTechnology` (x2 — one per curriculum), `assignTagToModule`
(x2), the new `mergeCurriculum` action gap below.

**Action gaps:**
- `mergeCurriculum({ page, sourceCurriculumName, targetCurriculumName }): Promise<{
  sourceCurriculumId: string; targetCurriculumId: string }>` — direct structural mirror of
  `mergeSubject`: resolves both curriculum ids via `GET /curricula?subjectId=...`, locates the
  source's row (`curriculum-card`/`curriculum-name` scoped, or the existing `<li>` structure in
  `subject-section.tsx`), clicks its `curriculum-merge-button-${id}`, selects the target by name
  from `curriculum-merge-target-select-${id}`, clicks `curriculum-merge-confirm-${id}`, waits for
  the source row to detach from the DOM.

**Action-skill candidate:** No — single-use within this feature, not a flow other tickets are likely
to need standalone.

**Pre-test state:** baseline-only. The whole scenario builds its state in-test: one subject
(`createSubject`), two curricula reaching `ready` status via `studyTechnology` +
`approve-sources`/`confirm-structure` polled directly via `request.post`/`request.get` (same pattern
`merge-subjects-full-reassignment.test.ts` already uses — no new action needed for the polling
steps, since they're plain API calls in that existing test, not UI actions), one tag assigned to one
module per curriculum, one extra source added to the source curriculum via a direct
`request.post(/curricula/:id/sources)` call (no existing "add source via UI" action needed — the
add-sources-form UI exists but a direct API call is simpler scenery setup for a source that isn't
the thing under test).

**Required `data-testid` attributes** (guidance for implementer):
- `curriculum-merge-button-${curriculumId}` — the "Merge into…" trigger on each curriculum's `<li>`
- `curriculum-merge-target-select-${curriculumId}` — the target-curriculum `<select>`
- `curriculum-merge-confirm-${curriculumId}` — the confirm button
- `curriculum-merge-cancel-${curriculumId}` — the cancel button

**Fixture variants:** none new — reuses `mockDocsSiteBaseUrl()` from
`features/curriculum/fixtures/mock-data`, already used by `study-technology-doc-url`'s existing test
and by `merge-subjects-full-reassignment.test.ts`.

**Vision check candidate:** no — structural + direct-SQL assertions are sufficient, matching
`ontology-split-merge`'s own S1.

---

### S2 — The merge-target picker only ever offers another curriculum in the same subject

**Composes actions:** `createSubject` (x2 — two subjects), `studyTechnology` (enough to get each
curriculum onto the home page's list; does not need to reach `ready` for this scenario, since the
assertion is about the picker's option list, not merged content), the new `openCurriculumMergePicker`
action gap below.

**Action gaps:**
- `openCurriculumMergePicker({ page, curriculumName }): Promise<{ optionLabels: string[] }>` —
  direct structural mirror of `openMergePicker`: locates the curriculum's row by name, clicks its
  `curriculum-merge-button-${id}`, reads back `curriculum-merge-target-select-${id}`'s option list as
  visible text, leaves the picker open/unconfirmed.

**Action-skill candidate:** No — same reasoning as `mergeCurriculum`.

**Pre-test state:** baseline-only. Two subjects, each with one curriculum (subject A's curriculum
has no sibling to merge into; subject B gets a second curriculum added specifically to prove the
picker offers exactly the one sibling and nothing from subject A).

**Required `data-testid` attributes:** same four as S1 (already covers this scenario's needs — no
additional testids).

**Fixture variants:** none new.

**Vision check candidate:** no.

## Action gaps consolidated

| Action | Used by scenarios | Action-skill candidate? |
|---|---|---|
| `mergeCurriculum` | S1 | No |
| `openCurriculumMergePicker` | S2 | No |

## Pre-test state plan

| Scenario | State class | Notes |
|---|---|---|
| S1 | baseline-only | all state built in-test via real actions + a few direct API calls for polling/scenery (extra source, tag assignments) |
| S2 | baseline-only | two subjects, one with two curricula, built in-test |
| S3 | n/a (integration test, not e2e) | direct SQL seed against the e2e Postgres, mirrors `gap-mastery-cascade-delete.integration.test.ts`'s harness |
| S4 | n/a (integration test, not e2e) | direct SQL seed for the pending-turn row shape, same harness style |

## Open questions

None. Every fork this plan needed to resolve (module reconciliation, the full reassignment/delete/
exclude table split, the pending-turn precondition, the shared-locking extraction) is resolved in
`spec.md`'s Decisions made autonomously, cross-checked against an independent architect pass
recorded in `discussion.md`.
