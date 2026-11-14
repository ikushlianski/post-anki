import { getDb } from "../db/client.js";
import { getSubject } from "../subject/subject.repo.js";
import { createSubjectSeedStore } from "../subject/seed/subject-seed.store.js";
import { ensureSubjectPath, parseSubjectPath } from "../subject/subject-path.js";

export type SubjectRefError = "invalid_path" | "not_found";

export interface ResolvedSubject {
  subjectId: string;
  subjectPath: string;
}

export async function resolveSubjectForWrite(
  ref: string,
): Promise<ResolvedSubject | { error: SubjectRefError }> {
  const trimmed = ref.trim();

  if (!trimmed.includes("/")) {
    const byId = await getSubject(trimmed);

    if (byId) {
      return { subjectId: byId.id, subjectPath: byId.name };
    }
  }

  const parsed = parseSubjectPath(trimmed);

  if ("error" in parsed) {
    return { error: "invalid_path" };
  }

  const ensured = await ensureSubjectPath(parsed.segments);

  return { subjectId: ensured.subjectId, subjectPath: ensured.subjectPath };
}

export async function findExistingSubject(
  ref: string,
): Promise<ResolvedSubject | { error: SubjectRefError }> {
  const trimmed = ref.trim();
  const byId = trimmed.includes("/") ? null : await getSubject(trimmed);

  if (byId) {
    return { subjectId: byId.id, subjectPath: byId.name };
  }

  const parsed = parseSubjectPath(trimmed);

  if ("error" in parsed) {
    return { error: "invalid_path" };
  }

  const store = createSubjectSeedStore(getDb());
  const [rootName, ...childNames] = parsed.segments;
  let currentId = await store.findRootByName(rootName!);

  for (const childName of childNames) {
    currentId = currentId ? await store.findChildByName(currentId, childName) : null;
  }

  return currentId ? { subjectId: currentId, subjectPath: parsed.segments.join("/") } : { error: "not_found" };
}
