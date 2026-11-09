import { getDb } from "../db/client.js";
import { createSubjectSeedStore, type RootCapableSeedStore } from "./seed/subject-seed.store.js";

export const MAX_SUBJECT_PATH_DEPTH = 2;
export const MAX_SUBJECT_SEGMENT_LENGTH = 60;

export const SUBJECT_PATH_RULES =
  "Subject path must have 1 or 2 non-empty segments separated by '/', each at most 60 characters, e.g. 'Work/AIPeak'.";

export type ParsedSubjectPath = { segments: string[] } | { error: "invalid_path" };

export interface EnsuredSubjectPath {
  subjectId: string;
  subjectName: string;
  subjectPath: string;
  createdSubjects: string[];
}

export function parseSubjectPath(raw: string): ParsedSubjectPath {
  const segments = raw.split("/").map((segment) => segment.trim());

  const valid =
    segments.length >= 1 &&
    segments.length <= MAX_SUBJECT_PATH_DEPTH &&
    segments.every((segment) => segment.length >= 1 && segment.length <= MAX_SUBJECT_SEGMENT_LENGTH);

  return valid ? { segments } : { error: "invalid_path" };
}

export async function ensureSubjectPath(
  segments: string[],
  store: Pick<RootCapableSeedStore, "ensureRoot" | "findChildByName" | "createChild"> = createSubjectSeedStore(
    getDb(),
  ),
): Promise<EnsuredSubjectPath> {
  const [rootName, ...childNames] = segments;
  const root = await store.ensureRoot(rootName!);
  const names = [rootName!];
  const createdSubjects: string[] = root.created ? [rootName!] : [];
  let currentId = root.id;

  for (const childName of childNames) {
    const existing = await store.findChildByName(currentId, childName);
    const id = existing ?? (await store.createChild(currentId, childName));

    names.push(childName);

    if (!existing) {
      createdSubjects.push(names.join("/"));
    }

    currentId = id;
  }

  return {
    subjectId: currentId,
    subjectName: names[names.length - 1]!,
    subjectPath: names.join("/"),
    createdSubjects,
  };
}
