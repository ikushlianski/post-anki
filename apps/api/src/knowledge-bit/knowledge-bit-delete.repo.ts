import { and, eq, inArray } from "drizzle-orm";
import type { BulkDeleteKnowledgeBitsResponse } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import {
  knowledgeBitReviews,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeBitSchedules,
  knowledgeBitVariantAttempts,
  tagAssignments,
} from "../db/schema.js";

// Permanent: approved bits only. Feedback rows are kept (they hold their own copies).
export async function deleteKnowledgeBitsBulk(
  ids: string[],
  db: DbExecutor = getDb(),
): Promise<BulkDeleteKnowledgeBitsResponse> {
  return db.transaction((tx) => deleteKnowledgeBitsBulkIn(ids, tx));
}

async function deleteKnowledgeBitsBulkIn(
  ids: string[],
  db: DbExecutor,
): Promise<BulkDeleteKnowledgeBitsResponse> {
  const uniqueIds = [...new Set(ids)];

  const locked = await db
    .select({ id: knowledgeBits.id, approvalState: knowledgeBits.approvalState })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, uniqueIds))
    .for("update");

  const stateById = new Map(locked.map((row) => [row.id, row.approvalState]));
  const deleted = uniqueIds.filter((id) => stateById.get(id) === "approved");

  const skipped = uniqueIds.flatMap((id) => {
    const state = stateById.get(id);

    if (state === "approved") {
      return [];
    }

    return [{ id, reason: state === undefined ? ("not_found" as const) : ("not_approved" as const) }];
  });

  if (deleted.length > 0) {
    await deleteBitsAndDependents(deleted, db);
  }

  return { deleted, skipped };
}

async function deleteBitsAndDependents(bitIds: string[], db: DbExecutor): Promise<void> {
  const variantRows = await db
    .select({ id: knowledgeBitQuestionVariants.id })
    .from(knowledgeBitQuestionVariants)
    .where(inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds));

  const variantIds = variantRows.map((row) => row.id);

  if (variantIds.length > 0) {
    await db
      .delete(knowledgeBitVariantAttempts)
      .where(inArray(knowledgeBitVariantAttempts.variantId, variantIds));
  }

  await db.delete(knowledgeBitReviews).where(inArray(knowledgeBitReviews.knowledgeBitId, bitIds));
  await db.delete(knowledgeBitSchedules).where(inArray(knowledgeBitSchedules.knowledgeBitId, bitIds));
  await db
    .delete(tagAssignments)
    .where(and(eq(tagAssignments.nodeType, "knowledgeBit"), inArray(tagAssignments.nodeId, bitIds)));
  await db
    .delete(knowledgeBitQuestionVariants)
    .where(inArray(knowledgeBitQuestionVariants.knowledgeBitId, bitIds));
  await db.delete(knowledgeBits).where(inArray(knowledgeBits.id, bitIds));
}
