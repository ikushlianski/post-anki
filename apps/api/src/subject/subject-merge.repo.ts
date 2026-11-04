import { and, eq, inArray } from "drizzle-orm";
import type { MergeSubjectsResult } from "@post-anki/shared";
import { withMergeLock, type Tx } from "../shared/merge-lock.js";
import { deleteSubjectGoals } from "../study-goal/add-knowledge-goal.repo.js";
import {
  curricula,
  domainNodes,
  domainPrioritySuggestions,
  domainSupersessionSuggestions,
  domainTopicSuggestions,
  knowledgeSources,
  notionIngestionSources,
  subjectDuplicateSuggestions,
  subjects,
  trackedToolScanState,
} from "../db/schema.js";
import { insertOntologyMergeLog } from "../ontology-merge/ontology-merge.repo.js";
import { invalidateStalePendingDuplicateSuggestions } from "./subject-write.repo.js";

// Moves the source subject's three domain-review suggestion tables onto the
// target, alongside the curricula and domain_nodes the merge already moves.
// Reassignment rather than invalidation, for two reasons:
//
//   * These rows' payloads reference domain NODE IDS
//     (proposed_parent_node_id / domain_node_id), and mergeSubjects moves the
//     whole domain_nodes forest by subject_id alone — every id a payload
//     names still exists, now under the target — so a moved suggestion stays
//     resolvable and means the same thing it meant before.
//   * There is no representable "invalidated" state to move them to:
//     domainSuggestionStatusSchema / domainPrioritySuggestionStatusSchema
//     (packages/shared/src/domain-map.ts) are strictly
//     pending|accepted|rejected and every read parses through them, unlike
//     subject_duplicate_suggestions' own status enum which does carry
//     "stale". Inventing one would be a shared-schema plus web change, not a
//     repo-local one.
//
// Deliberately NOT pending-only, which is where this parts company with
// invalidateStalePendingDuplicateSuggestions above: there subject_id is part
// of the historical claim ("these two subjects looked alike"), here it is
// purely the routing key deciding whose review panel a row renders in, so
// resolved history has to follow its nodes too or it becomes unreachable.
// Consequence worth knowing: getLastReviewedAt() is MAX(created_at) per
// subject, so absorbing a more recently reviewed source moves the target's
// "last reviewed" forward and its "review due" back.
//
// A pending topic suggestion with a null proposed_parent_node_id meant
// "attach at the source's root" and now reads as "attach at the target's
// root" — accepted deliberately: the source's roots became the target's
// roots in the same merge, and there is no better anchor.
async function reassignSubjectSuggestions(
  tx: Tx,
  sourceId: string,
  targetId: string,
): Promise<void> {
  await tx
    .update(domainTopicSuggestions)
    .set({ subjectId: targetId })
    .where(eq(domainTopicSuggestions.subjectId, sourceId));

  await tx
    .update(domainSupersessionSuggestions)
    .set({ subjectId: targetId })
    .where(eq(domainSupersessionSuggestions.subjectId, sourceId));

  await tx
    .update(domainPrioritySuggestions)
    .set({ subjectId: targetId })
    .where(eq(domainPrioritySuggestions.subjectId, sourceId));
}

// tracked_tool_scan_state is keyed (subject_id, tool_key), so a blind
// reassign of the source's rows onto the target — the doc-scan suggestion
// tables' own pattern above — would throw a PK conflict on every tool the
// target has already scanned. For each tool_key the source scanned:
//   * the target already has a row for it — the source's row is deleted,
//     keeping the target's watermark as authoritative (it's presumably the
//     more relevant one). Costs one possibly-redundant re-scan of that tool
//     under the target later — harmless, one extra agent call.
//   * the target has no row for it — the source's row is reassigned onto
//     the target, preserving its watermark instead of losing it.
async function reassignTrackedToolScanState(
  tx: Tx,
  sourceId: string,
  targetId: string,
): Promise<void> {
  const [sourceRows, targetRows] = await Promise.all([
    tx
      .select({ toolKey: trackedToolScanState.toolKey })
      .from(trackedToolScanState)
      .where(eq(trackedToolScanState.subjectId, sourceId)),
    tx
      .select({ toolKey: trackedToolScanState.toolKey })
      .from(trackedToolScanState)
      .where(eq(trackedToolScanState.subjectId, targetId)),
  ]);

  const targetToolKeys = new Set(targetRows.map((row) => row.toolKey));
  const conflictingToolKeys = sourceRows
    .map((row) => row.toolKey)
    .filter((toolKey) => targetToolKeys.has(toolKey));

  if (conflictingToolKeys.length > 0) {
    await tx
      .delete(trackedToolScanState)
      .where(
        and(
          eq(trackedToolScanState.subjectId, sourceId),
          inArray(trackedToolScanState.toolKey, conflictingToolKeys),
        ),
      );
  }

  await tx
    .update(trackedToolScanState)
    .set({ subjectId: targetId })
    .where(eq(trackedToolScanState.subjectId, sourceId));
}

export type MergeSubjectsError = "self_merge" | "not_found" | "kind_mismatch";

/**
 * Absorbs `sourceId` into `targetId`: every curriculum and the whole
 * domain_nodes forest owned by the source move to the target (subject_id
 * only — domain_nodes.parent_id is never touched, so the moved forest keeps
 * its shape and becomes additional root(s) under the target), the three
 * domain-review suggestion tables follow their nodes across (see
 * reassignSubjectSuggestions above), then the
 * source subject row is deleted directly (not via deleteSubject(), which
 * would cascade-delete the curricula this merge just reassigned away — see
 * spec.md Decision #4).
 *
 * Preconditions are re-checked INSIDE the transaction, after both advisory
 * locks are held (sorted lexicographically to prevent a cross-merge
 * deadlock) — never before opening it — so a concurrent merge that already
 * deleted one side surfaces as a clean "not_found" 404 instead of racing on
 * a stale pre-transaction read (spec.md's double-merge race, Scenario 5).
 *
 * `resolvingSuggestionId` (ai-duplicate-detection, issue #63) — when this
 * merge is the atomic-accept path for a subject-duplicate suggestion, the
 * caller passes the id of the specific suggestion being accepted. After the
 * usual stale-invalidation sweep below sets EVERY pending suggestion
 * referencing sourceId (including this one) to "stale", this one row is
 * immediately overwritten to "accepted" instead — still inside this same
 * transaction, so either both effects commit or neither does (spec.md's
 * Decision #7 / architecture.md's "Accept must be atomic" — fixes a crash
 * window an earlier two-sequential-writes draft left open, where an
 * accepted suggestion could get permanently stuck at "stale"). Omitted
 * (undefined) for the pre-existing manual "Merge into…" control, which has
 * no suggestion to resolve — behavior for that call site is unchanged.
 */
export async function mergeSubjects(
  targetId: string,
  sourceId: string,
  resolvingSuggestionId?: string,
): Promise<MergeSubjectsResult | { error: MergeSubjectsError }> {
  return withMergeLock(targetId, sourceId, async (tx) => {
    const targetRow = (
      await tx.select().from(subjects).where(eq(subjects.id, targetId))
    )[0];
    const sourceRow = (
      await tx.select().from(subjects).where(eq(subjects.id, sourceId))
    )[0];

    if (!targetRow || !sourceRow) {
      return { error: "not_found" as const };
    }

    if (targetRow.kind !== "architecture-mentor" || sourceRow.kind !== "architecture-mentor") {
      return { error: "kind_mismatch" as const };
    }

    const movedCurricula = await tx
      .update(curricula)
      .set({ subjectId: targetId })
      .where(eq(curricula.subjectId, sourceId))
      .returning({ id: curricula.id });

    const movedDomainNodes = await tx
      .update(domainNodes)
      .set({ subjectId: targetId })
      .where(eq(domainNodes.subjectId, sourceId))
      .returning({ id: domainNodes.id });

    await tx
      .update(knowledgeSources)
      .set({ subjectId: targetId })
      .where(eq(knowledgeSources.subjectId, sourceId));

    await tx
      .update(notionIngestionSources)
      .set({ subjectId: targetId })
      .where(eq(notionIngestionSources.subjectId, sourceId));

    await reassignSubjectSuggestions(tx, sourceId, targetId);
    await reassignTrackedToolScanState(tx, sourceId, targetId);

    await deleteSubjectGoals(sourceId, tx);
    await tx.delete(subjects).where(eq(subjects.id, sourceId));

    await invalidateStalePendingDuplicateSuggestions(tx, sourceId);

    if (resolvingSuggestionId) {
      await tx
        .update(subjectDuplicateSuggestions)
        .set({ status: "accepted", resolvedAt: new Date() })
        .where(eq(subjectDuplicateSuggestions.id, resolvingSuggestionId));
    }

    await insertOntologyMergeLog(
      {
        entityType: "subject",
        targetId,
        targetName: targetRow.name,
        sourceId,
        sourceName: sourceRow.name,
        reassignedCounts: {
          curriculaMoved: movedCurricula.length,
          domainNodesMoved: movedDomainNodes.length,
        },
      },
      tx,
    );

    return {
      targetSubjectId: targetId,
      sourceSubjectId: sourceId,
      curriculaMoved: movedCurricula.length,
      domainNodesMoved: movedDomainNodes.length,
    };
  });
}
