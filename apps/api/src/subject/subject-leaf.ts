import { eq, isNotNull } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";

export const COMMON_SUBJECT_NAME = "Common";

export type SubjectAssignmentError = "subject_not_found";

export async function findSubjectAssignmentError(
  subjectId: string,
  db: DbExecutor = getDb(),
): Promise<SubjectAssignmentError | null> {
  const [row] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);

  return row ? null : "subject_not_found";
}

export async function listParentSubjectIds(db: DbExecutor = getDb()): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ parentId: subjects.parentId })
    .from(subjects)
    .where(isNotNull(subjects.parentId));

  return new Set(rows.flatMap((row) => (row.parentId === null ? [] : [row.parentId])));
}
