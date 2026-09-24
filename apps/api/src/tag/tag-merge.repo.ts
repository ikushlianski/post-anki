import { eq, sql } from "drizzle-orm";
import type { MergeTagsResult } from "@post-anki/shared";
import { tagAssignments, tags } from "../db/schema.js";
import { withMergeLock } from "../shared/merge-lock.js";
import { insertOntologyMergeLog } from "../ontology-merge/ontology-merge.repo.js";

export type MergeTagsError = "self_merge" | "not_found";

/**
 * Absorbs `sourceId` into `targetId`. Order matters: the dedupe delete (step
 * 1 below) MUST run before the bulk reassignment UPDATE (step 2), or the
 * bulk update would collide with `tag_assignments_tag_node_unique` on the
 * very rows the dedupe step exists to clear first (a node already carrying
 * both tags). Also reassigns any active/historical tag-scoped
 * `probe_sessions.scope_id` — without it, a session becomes silently
 * unreachable (not deleted, just orphaned from `getActiveSessionRow`'s
 * lookup) the moment its tag is merged away.
 */
export async function mergeTags(
  targetId: string,
  sourceId: string,
): Promise<MergeTagsResult | { error: MergeTagsError }> {
  return withMergeLock(targetId, sourceId, async (tx) => {
    const targetRow = (await tx.select().from(tags).where(eq(tags.id, targetId)))[0];
    const sourceRow = (await tx.select().from(tags).where(eq(tags.id, sourceId)))[0];

    if (!targetRow || !sourceRow) {
      return { error: "not_found" as const };
    }

    const dedupedResult = await tx.execute(sql`
      DELETE FROM tag_assignments
      WHERE tag_id = ${sourceId}
        AND (node_type, node_id) IN (
          SELECT node_type, node_id FROM tag_assignments WHERE tag_id = ${targetId}
        )
    `);
    const assignmentsDeduped = dedupedResult.rowCount ?? 0;

    const movedResult = await tx.execute(sql`
      UPDATE tag_assignments SET tag_id = ${targetId} WHERE tag_id = ${sourceId}
    `);
    const assignmentsMoved = movedResult.rowCount ?? 0;

    const sessionsResult = await tx.execute(sql`
      UPDATE probe_sessions SET scope_id = ${targetId}
      WHERE scope = 'tag' AND scope_id = ${sourceId}
    `);
    const sessionsMoved = sessionsResult.rowCount ?? 0;

    await tx.delete(tags).where(eq(tags.id, sourceId));

    await insertOntologyMergeLog(
      {
        entityType: "tag",
        targetId,
        targetName: targetRow.name,
        sourceId,
        sourceName: sourceRow.name,
        reassignedCounts: { assignmentsMoved, assignmentsDeduped, sessionsMoved },
      },
      tx,
    );

    return {
      targetTagId: targetId,
      sourceTagId: sourceId,
      assignmentsMoved,
      assignmentsDeduped,
      sessionsMoved,
    };
  });
}
