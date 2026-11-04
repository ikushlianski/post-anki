import { buildSubjectPathLabel, type SubjectHierarchyRow } from "@post-anki/core";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";

export function buildSubjectPathLabels(rows: SubjectHierarchyRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.id, buildSubjectPathLabel(row.id, rows)]));
}

export async function loadSubjectPathLabels(db: DbExecutor = getDb()): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId })
    .from(subjects);

  return buildSubjectPathLabels(rows);
}
