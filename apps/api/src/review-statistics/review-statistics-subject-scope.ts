import { collectSubjectSubtreeIds } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";

export async function resolveSubjectScope(
  subjectId: string | undefined,
  db: DbExecutor = getDb(),
): Promise<{ subjectIds: string[] | undefined; empty: boolean }> {
  if (subjectId === undefined) {
    return { subjectIds: undefined, empty: false };
  }

  const rows = await db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects);

  if (!rows.some((row) => row.id === subjectId)) {
    return { subjectIds: [], empty: true };
  }

  return { subjectIds: collectSubjectSubtreeIds(subjectId, rows), empty: false };
}
