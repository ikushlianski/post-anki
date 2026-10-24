import { eq, inArray } from "drizzle-orm";
import type { BulkMoveKnowledgeBitsResponse } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBits, knowledgeSources } from "../db/schema.js";
import { findSubjectAssignmentError, type SubjectAssignmentError } from "../subject/subject-leaf.js";

// Moves standalone bits (topicId IS NULL) to the target subject by updating their
// source's subjectId. Curriculum-attached bits (topicId IS NOT NULL) are skipped
// because their effective subject is owned by their curriculum.
export type MoveKnowledgeBitsError = SubjectAssignmentError;

export async function moveKnowledgeBitsBulk(
  ids: string[],
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<BulkMoveKnowledgeBitsResponse | { error: MoveKnowledgeBitsError }> {
  return db.transaction((tx) => moveKnowledgeBitsBulkIn(ids, subjectId, tx));
}

async function moveKnowledgeBitsBulkIn(
  ids: string[],
  subjectId: string,
  db: DbExecutor,
): Promise<BulkMoveKnowledgeBitsResponse | { error: MoveKnowledgeBitsError }> {
  const assignmentError = await findSubjectAssignmentError(subjectId, db);

  if (assignmentError) {
    return { error: assignmentError };
  }

  const uniqueIds = [...new Set(ids)];

  const locked = await db
    .select({
      id: knowledgeBits.id,
      approvalState: knowledgeBits.approvalState,
      topicId: knowledgeBits.topicId,
      knowledgeSourceId: knowledgeBits.knowledgeSourceId,
    })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, uniqueIds))
    .orderBy(knowledgeBits.id)
    .for("update");

  const byId = new Map(locked.map((row) => [row.id, row]));

  const moved: string[] = [];
  const skipped: BulkMoveKnowledgeBitsResponse["skipped"] = [];

  const sourceIds = new Set<string>();

  for (const id of uniqueIds) {
    const row = byId.get(id);

    if (!row) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }

    if (row.topicId !== null) {
      skipped.push({ id, reason: "curriculum_placed" });
      continue;
    }

    if (row.approvalState !== "approved") {
      skipped.push({ id, reason: "not_approved" });
      continue;
    }

    moved.push(id);
    sourceIds.add(row.knowledgeSourceId);
  }

  if (sourceIds.size > 0) {
    await db
      .update(knowledgeSources)
      .set({ subjectId })
      .where(inArray(knowledgeSources.id, [...sourceIds]));
  }

  return { moved, skipped };
}
