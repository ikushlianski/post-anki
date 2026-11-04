import type { RejectSubjectType } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { pickSubjectKind, type SubjectKindRow } from "./subject-kind.js";

export const PROGRAMMING_SUBJECT_NAMES = [
  "programming",
  "software",
  "software engineering",
  "coding",
  "development",
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "golang",
  "java",
  "kotlin",
  "swift",
  "sql",
  "react",
  "node.js",
  "css",
  "html",
] as const;

const PROGRAMMING_NAMES = new Set<string>(PROGRAMMING_SUBJECT_NAMES);

function hasProgrammingAncestor(subjectId: string, rows: SubjectKindRow[]): boolean {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let current = byId.get(subjectId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);

    if (PROGRAMMING_NAMES.has(current.name.trim().toLowerCase())) {
      return true;
    }

    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return false;
}

export function pickRejectSubjectType(subjectId: string | null, rows: SubjectKindRow[]): RejectSubjectType {
  if (!subjectId) {
    return "other";
  }

  const kind = pickSubjectKind(subjectId, rows);

  if (kind === "language" || kind === "business") {
    return kind;
  }

  return hasProgrammingAncestor(subjectId, rows) ? "programming" : "other";
}

export async function loadSubjectKindRows(db: DbExecutor = getDb()): Promise<SubjectKindRow[]> {
  return db
    .select({ id: subjects.id, parentId: subjects.parentId, name: subjects.name, kind: subjects.kind })
    .from(subjects);
}

export async function resolveRejectSubjectType(subjectId: string | null): Promise<RejectSubjectType> {
  if (!subjectId) {
    return "other";
  }

  return pickRejectSubjectType(subjectId, await loadSubjectKindRows());
}
