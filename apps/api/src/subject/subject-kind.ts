import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";

export type SubjectKind = "business" | "language" | "other";

export const LANGUAGE_ROOT_NAMES = [
  "English",
  "Polish",
  "Spanish",
  "Swedish",
  "German",
  "French",
  "Italian",
  "Portuguese",
  "Russian",
  "Ukrainian",
  "Dutch",
  "Czech",
  "Japanese",
  "Chinese",
  "Korean",
] as const;

const LANGUAGE_NAMES = new Set(LANGUAGE_ROOT_NAMES.map((name) => name.toLowerCase()));

export interface SubjectKindRow {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
}

export function pickSubjectKind(subjectId: string | null, rows: SubjectKindRow[]): SubjectKind {
  if (!subjectId) {
    return "other";
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let current = byId.get(subjectId);
  let root = current;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);

    if (current.kind === "language-practice") {
      return "language";
    }

    root = current;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  const rootName = root?.name.trim().toLowerCase();

  if (rootName && LANGUAGE_NAMES.has(rootName)) {
    return "language";
  }

  return rootName === "business" ? "business" : "other";
}

export async function resolveSubjectKind(subjectId: string | null): Promise<SubjectKind> {
  if (!subjectId) {
    return "other";
  }

  const rows = await getDb()
    .select({ id: subjects.id, parentId: subjects.parentId, name: subjects.name, kind: subjects.kind })
    .from(subjects);

  return pickSubjectKind(subjectId, rows);
}
