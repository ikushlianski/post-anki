import { asc, eq, isNull, sql } from "drizzle-orm";
import { wouldCreateSubjectCycle } from "@post-anki/core";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import type { Tx } from "../shared/merge-lock.js";

export type SubjectParentError = "parent_not_found" | "invalid_parent";

// Unknown parent, or a parent that would make the subject its own ancestor (itself included).
export async function findParentAssignmentError(
  subjectId: string,
  parentId: string | null,
): Promise<SubjectParentError | null> {
  if (parentId === null) {
    return null;
  }

  const rows = await getDb()
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);

  if (!rows.some((row) => row.id === parentId)) {
    return "parent_not_found";
  }

  return wouldCreateSubjectCycle(subjectId, parentId, rows) ? "invalid_parent" : null;
}

export type ReorderSubjectsError = "invalid_id_set" | "parent_not_found";

// Rewrites sort_order to 0..n-1 for one sibling group. The sibling rows are locked
// first, so concurrent reorders of the same group run one after another.
export async function reorderSubjects(
  parentId: string | null,
  orderedIds: string[],
): Promise<{ reordered: number } | { error: ReorderSubjectsError }> {
  return getDb().transaction(async (tx) => {
    if (parentId !== null) {
      const parent = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(eq(subjects.id, parentId));

      if (parent.length === 0) {
        return { error: "parent_not_found" as const };
      }
    }

    const siblings = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(parentId === null ? isNull(subjects.parentId) : eq(subjects.parentId, parentId))
      .for("update");

    const siblingIds = new Set(siblings.map((row) => row.id));
    const payloadIds = new Set(orderedIds);

    if (
      payloadIds.size !== orderedIds.length ||
      siblingIds.size !== payloadIds.size ||
      !orderedIds.every((id) => siblingIds.has(id))
    ) {
      return { error: "invalid_id_set" as const };
    }

    for (const [index, id] of orderedIds.entries()) {
      await tx.update(subjects).set({ sortOrder: index }).where(eq(subjects.id, id));
    }

    return { reordered: orderedIds.length };
  });
}

// parent_id has no FK, so a deleted subject's sub-subjects would keep pointing at
// a missing row. They move up to the deleted subject's parent (top level if it
// had none), keep their relative order, and go after that group's existing siblings.
export async function reparentChildrenOfDeletedSubject(
  tx: Tx,
  deleted: typeof subjects.$inferSelect,
): Promise<void> {
  const children = await tx
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.parentId, deleted.id))
    .orderBy(sql`${subjects.sortOrder} asc nulls last`, asc(subjects.name), asc(subjects.id));

  if (children.length === 0) {
    return;
  }

  const newParentId =
    deleted.parentId === null
      ? null
      : ((
          await tx
            .select({ id: subjects.id })
            .from(subjects)
            .where(eq(subjects.id, deleted.parentId))
        )[0]?.id ?? null);

  const siblings = await tx
    .select({ sortOrder: subjects.sortOrder })
    .from(subjects)
    .where(newParentId === null ? isNull(subjects.parentId) : eq(subjects.parentId, newParentId));

  const firstSortOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder ?? -1), -1) + 1;

  await Promise.all(
    children.map((child, index) =>
      tx
        .update(subjects)
        .set({ parentId: newParentId, sortOrder: firstSortOrder + index })
        .where(eq(subjects.id, child.id)),
    ),
  );
}
