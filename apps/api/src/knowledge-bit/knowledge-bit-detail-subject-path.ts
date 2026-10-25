export interface SubjectNode {
  id: string;
  name: string;
  parentId: string | null;
}

export function deriveSubjectPath(
  subjectId: string | null,
  subjects: readonly SubjectNode[],
): string[] {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const seen = new Set<string>();
  const path: string[] = [];
  let current = subjectId ? byId.get(subjectId) : undefined;

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}
