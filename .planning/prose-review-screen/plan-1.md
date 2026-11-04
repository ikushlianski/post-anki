---
todo: "Phase 3: review screen"
direction: prose-knowledge-fisher
---

## Goal

The learner can see all pending bits from pasted prose on a dedicated screen and approve, reject, or
edit each one before it enters the review queue.

## Existing coverage

The screen already exists at `/knowledge-bit-review` (`apps/web/src/routes/knowledge-bit-review.tsx`).
It loads pending bits via `GET /knowledge-bits/pending-review`, groups them by source (with source
text preview), supports approve/reject/edit per bit, per-source bulk approve, keyboard nav, empty
state, and polling for new bits. The sidebar shows "Approve suggestions (N)". The add-knowledge
success message links here. Phase 1's approve/reject/edit APIs and Phase 2's learner-queue guard are
already wired in.

Phase 3 is therefore a UI enhancement, not a net-new screen. The one genuine gap: `PendingKnowledgeSourceForReview`
carries no subject label, so a learner with bits from multiple subjects cannot tell which bits
belong to which subject. `knowledgeSources.subjectId` exists and `subjects.name` is available via
a left join; neither surfaces in the response today.

## Approach

One change touches three layers of the existing knowledge-bit module — shared type, API repo, web
component — without adding any new module, boundary, or API endpoint. Everything stays inside the
knowledge-bit domain as `brief.md` (not yet written for this direction) would describe.

## Steps

**Step 1 — Extend the shared type** (`packages/shared/src/knowledge-bit.ts`)
- Add `subjectName: string | null` to `PendingKnowledgeSourceForReview`.

**Step 2 — Return subject name from the API** (`apps/api/src/knowledge-bit/knowledge-bit-approval.repo.ts`)
- In `listPendingKnowledgeBitsForReview`, left join `subjects` on `knowledgeSources.subjectId = subjects.id`.
- Select `subjects.name` and map it into each grouped source entry as `subjectName`.

**Step 3 — Display subject name in the source group** (`apps/web/src/knowledge-bit/knowledge-bit-review-source-group.tsx`)
- When `source.subjectName` is non-null, render it as a small label above the source text preview.

**Step 4 — Update the test** (`apps/api/src/knowledge-bit/knowledge-bit-approval.repo.integration.test.ts`)
- Add a case: when a source has a subject, `listPendingKnowledgeBitsForReview` returns `subjectName` equal to that subject's name.
- Add a case: when a source has no subject, `subjectName` is null.

## Tests

Unit/integration tests go in `knowledge-bit-approval.repo.integration.test.ts` (already exists):
- "returns subjectName from linked subject when present"
- "returns null subjectName when source has no subject"

Component test can be added to `knowledge-bit-review-panel.test.tsx` if the source group is exercised there; otherwise skip — the repo test covers the data contract and the visual change is shallow.

## Done when

- `PendingKnowledgeSourceForReview.subjectName` is typed as `string | null` in `packages/shared`.
- `GET /knowledge-bits/pending-review` returns `subjectName` for each source group.
- The source group header shows the subject name when present; nothing extra when absent.
- Both repo integration test cases pass.
- `npx tsc --noEmit` and lint are clean.

## Defaults chosen

- Left join (not inner): sources without a subject still appear, with `subjectName: null` — matching
  the existing nullable `sourceText` pattern on the same type.
- Label-only, no filter: a filter adds complexity and a second API call; the label covers the
  immediate gap and a filter can follow as a separate todo.

END-OF-REPORT
