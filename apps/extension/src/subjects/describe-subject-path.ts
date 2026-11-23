import type { SubjectOption } from "./fetch-subjects.js";

export const PATH_SEPARATOR = " › ";

export type Destination = { kind: "none" } | { kind: "path"; path: string } | { kind: "unknown" };

export function describeSubjectPath(subjects: SubjectOption[], subjectId: string): string | null {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(subjectId);

  if (current === undefined) {
    return null;
  }

  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId === undefined ? undefined : byId.get(current.parentId);
  }

  return names.join(PATH_SEPARATOR);
}
