---
type: plan
branch: learn-from-doc-site
task: Let parent subjects hold cards
state: confirmed
updated: 2026-10-25
---
# Plan: Let parent subjects hold cards

This lifts the "cards only on subjects without children" rule. The one idea it hinges on: a subject's cards are whatever is filed on that subject, and every read already rolls a subject up as "itself plus its subtree", so only the write paths and two AI helpers change. Deliberate non-changes: no schema change, no data migration, existing "Common" sub-subjects stay, no phone or Mac release, the subject checker and the add-knowledge picker defaults stay as they are.

**Legend:** ➕ add · ✏️ change · ➖ remove

## 1. Database
| | Table | Change | Why |
|---|---|---|---|
| | — | None. `0104_backfill-common-subject.sql` stays applied and unedited. | Existing "Common" rows remain ordinary sub-subjects. |

## 2. Business rules
- ✏️ Any existing subject may hold cards; the only refusal left is "subject not found".
- ➖ Gaining a first sub-subject (create, reparent, AI suggestion accept, Business seed) no longer moves the parent's sources into "Common".
- ✏️ The parent advisory lock stays on subject create and reparent.
- ✏️ AI placement offers every included topic of every top-level course, parents' courses included, still capped at `TOPIC_HIERARCHY_PROMPT_LIMIT`.
- ➕ `pickSubSubjectPoolIds(subject, children)`: pool = the subject itself, plus its child named "Common" when present.
- Unchanged: a "Common" child is never a sub-subject suggestion candidate itself; review, due counts, browser and overview use `collectSubjectSubtreeIds` (self plus descendants).

## 3. Services
| | File | What it does |
|---|---|---|
| ✏️ | `apps/api/src/subject/subject-leaf.ts` | `findSubjectAssignmentError` checks existence only; ➖ `listParentSubjectIds`, `listLeafSubjectIds`, `ensureCommonSubject`, `moveSourcesToCommon`, `hasChildSubjects`, `absorbParentItemsOnFirstChild`; keeps `COMMON_SUBJECT_NAME` |
| ✏️ | `apps/api/src/subject/subject.repo.ts` | `createSubject`/`updateSubject` keep the parent lock, drop the absorb step |
| ✏️ | `apps/api/src/knowledge-bit/knowledge-bit-move.repo.ts` | error type narrows to `subject_not_found` |
| ✏️ | `apps/api/src/knowledge-bit/knowledge-bit-placement.repo.ts` | `listTopicsForPlacement` drops the parent exclusion |
| ➕ | `apps/api/src/subject-suggestion/subject-suggestion-pool.ts` | the pool deriver |
| ✏️ | `apps/api/src/subject-suggestion/subject-suggestion-sub-subjects.ts` | uses the pool; pool size sums counts across pool ids |
| ✏️ | `apps/api/src/subject-suggestion/subject-suggestion-evidence.repo.ts` | `listBitsForSubject` takes a list of subject ids |
| ✏️ | `apps/api/scripts/seed-business-sub-subjects.ts` | `createChild` without absorb |

## 4. API endpoints
| | Method | Path | Who | Purpose | Errors |
|---|---|---|---|---|---|
| ✏️ | POST | `/knowledge-sources` (text, batch, url) | learner | file knowledge under any subject | ➖ 409 `subject_has_children`; 400 `subject_not_found` stays |
| ✏️ | POST | `/knowledge-bits/moves` | learner | move unplaced approved cards to any subject | ➖ 409 `subject_has_children`; 404 `subject_not_found` stays |
| | POST/PATCH | `/subjects`, `/subjects/:id` | learner | create or reparent a subject | unchanged errors; no side effect on cards |

## 5. Background jobs
- ✏️ Card placement scan: parent subjects' course topics join the prompt's topic list.
- ✏️ Subject suggestion scan, sub-subject branch: a parent with children is considered when its own cards plus a "Common" child's cards reach `SUBJECT_SUGGESTION_MIN_POOL_FOR_SUB_SUBJECTS`.

## 6. Shared contract
- ➖ `subject_has_children` from `REFUSAL_SENTENCES` in `packages/shared/src/knowledge-source-refusal.ts`.

## 7. Frontend
| | Where | Change |
|---|---|---|
| ➖ | `apps/web/src/knowledge-bit/use-knowledge-overview-move.ts` | has-children message and branch; generic failure stays |
| | `apps/web/src/knowledge-source/use-knowledge-subject-choice.ts` | unchanged: parents behind "Also allow parent subjects" |
| | `apps/ios/**` | unchanged code |

## 8. Tests
- ➕ `subject-suggestion-pool.test.ts`: a parent with a Common child pools both; a parent without one pools only itself; a subject without children pools itself.
- ✏️ `subject-leaf.integration.test.ts`: parent accepts assignment; first child by create, reparent, or a child named Common leaves sources on the parent and creates no Common; move into a parent succeeds.
- ✏️ `knowledge-source.controller.test.ts`, `knowledge-bit-move.controller.test.ts`: 409 cases replaced by success on a parent.
- ✏️ `knowledge-bit-placement.repo.integration.test.ts`: parent course topics are offered.
- ✏️ `subject-suggestion-scan.test.ts`: parent with own cards gets suggestions; parent with only Common still does.
- ➕ review queue, due counts and browser integration tests: a parent's own card is included.
- ➕ `apps/web/src/routes/-add-knowledge.test.tsx`: parent picked via the checkbox is sent.
- Seed: `seed-knowledge-browser-demo.ts` gains a Common child with a few cards under Demo Programming.

## 9. Docs
- ✏️ `docs/architecture/subject/subject-hierarchy.md`: "Where cards live".
- ✏️ `apps/ios/README.md`: refusal list.

## 10. After deploy
- Nothing to run. Optionally open a parent subject in the browser and confirm its own cards are counted.

## Out of scope
- Subject checker recommending parents; picker showing parents by default; folding Common back; deleted subjects' own cards; phone and Mac app release; editing the applied backfill migration.
