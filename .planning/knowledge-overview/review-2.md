# Review 2: knowledge overview move feature (units E + router wiring)

Verdict: needs-changes

Mode: B (no spec.md/scenarios.md; contract = plan-1.md + review-1.md findings). Move, migration and
effective-subject adoption are out of scope. Reviewed against plan-1.md "E. Move" and the impl
summary (SubjectFilter dropdown, move dialog, announcer testids, controller, repo, router-table,
api-server).

## Checks run
- npx tsc --noEmit apps/web: exit 2 — all 62+ errors are in files not touched by this fix
  (admin-settings, model-comparison, knowledge-bit-review-draft-card, durable-extraction,
  knowledge-bit-approval-entries, etc.). New files compile cleanly.
- npx tsc --noEmit apps/api: exit 2 — same pattern; all errors pre-existing in unrelated modules.
- npx vitest run apps/web/src/routes/ apps/web/src/knowledge-bit/: 4 test files fail.
  2 failing tests are in -add-knowledge.test.tsx (model-choice); 2 file-level failures are in
  knowledge-bit-review-draft-card.test.tsx and knowledge-bit-review-panel.notes.test.tsx. None are
  in files touched by this fix; all are pre-existing. The overview/move/delete/keyboard/route tests
  that were 17 passing in review-1 still pass.
- Lint: none configured.

## Structural checks

### knowledge-overview-page.tsx — OverviewSubjectFilter
Inline custom dropdown (readOnly text input + ul/li overlay, lines 15–63). Not a native select.
Satisfies the brief requirement. onMouseDown uses preventDefault to prevent blur-before-click.
Matches plan-1 "Subject filter" for the web UI.

### knowledge-overview-move-dialog.tsx — native select
Native <select> at line 83, labelled by htmlFor, data-testid present. Satisfies the brief.
Dialog has role="alertdialog", aria-modal, labelled by h2, Tab trap (cancelRef/confirmRef), initial
focus on confirm, Escape cancels (not while busy), held-Enter propagation stopped. Move button
uses aria-disabled={!subjectId} and guards the onClick, so it is not activated before a subject
is chosen. Correct.

### knowledge-bit-review-announcer.tsx — testids
data-testid="knowledge-bit-review-announcer-polite" (line 19),
data-testid="knowledge-bit-review-announcer-assertive" (line 28). Present and correct.

### knowledge-bit-move.controller.ts
Reads body with bulkMoveKnowledgeBitsInput (Zod), returns 400 on invalid, calls repo, returns 200.
Clean; no any.

### knowledge-bit-move.repo.ts
Uses a transaction, de-duplicates IDs, locks rows with .for("update"), skips unapproved and
curriculum-attached bits, updates knowledge_sources.subjectId for moved bits. Clean structure.

### api-server.ts — 3 imports/cases
Import at line 45, case "bulkMoveKnowledgeBits" at line 495, switch is exhaustive. Correct.

## Blocking issues

### 1. router-table.ts: three routes duplicated (lines 153–166 are dead copies of 138–151)

The implementation added the `bulkMoveKnowledgeBits` entry and produced a file where
listKnowledgeBitOverview, bulkDeleteKnowledgeBits, and bulkMoveKnowledgeBits each appear twice
(lines 138–151 and again 153–166). The router uses the first match so requests resolve correctly,
but the three duplicate entries are dead code and represent a defect in the commit.

Fix: remove the second block (lines 153–166).

### 2. move.repo.ts: subject existence not validated; plan requires 404 subject_not_found

plan-1.md §API: "unknown subject 404 `subject_not_found`". The controller and repo do not query
the subjects table to verify subjectId. If the DB has no FK constraint on
knowledge_sources.subjectId the update silently sets a dangling reference; if it has a FK the
caller gets a 500 instead of 404.

Fix: query subjects.id before running the update, return {error: "subject_not_found"} with 404
if missing (mirroring how bulk-approval handles not-found subjects).

## Non-blocking findings

### Low: move.repo.ts — no ORDER BY on FOR UPDATE (deadlock risk)
Same pattern as delete.repo Low #1 in review-1. Two concurrent bulk moves on overlapping IDs in
different scan orders can deadlock. Add .orderBy(knowledgeBits.id) before .for("update")
(apps/api/src/knowledge-bit/knowledge-bit-move.repo.ts:32).

### Low: curriculum-attached bits silently skipped with reason "not_approved"
Row with topicId !== null is pushed to skipped with reason: "not_approved". The plan's skipped
schema only lists not_found and not_approved so there is no schema violation, but the reason
misleads callers: the bit may well be approved, just curriculum-placed. A curriculum_placed reason
would be more accurate if the schema is extended, or a note in the controller doc comment.

## Pre-existing issues (not introduced by this fix)
- tsc failures in both apps: all in unrelated modules (model-comparison, admin-settings,
  durable-extraction, knowledge-bit-review-draft-card, etc.).
- 4 test-file failures: all pre-existing, none in files changed by this fix.

END-OF-REPORT

## Fix note

Both blocking issues resolved. Duplicate route block (lines 153–166 of router-table.ts) removed; first occurrence kept. In knowledge-bit-move.repo.ts: subjects table queried before the UPDATE and `{ error: "subject_not_found" }` returned early if empty; `.orderBy(knowledgeBits.id)` added before `.for("update")` to prevent deadlock. Controller updated to send 404 on that error. `npx tsc --noEmit` reports no errors in the changed files (pre-existing failures in unrelated modules unchanged). No co-located test file exists for the move feature; generate-variants controller test (nearest co-located) passes.

END-OF-REPORT
## Final verdict: PASS
END-OF-REPORT
