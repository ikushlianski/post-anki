import type { SubjectOption } from "./fetch-subjects.js";

export const PATH_SEPARATOR = " › ";

export type OrderedSubject = { subject: SubjectOption; depth: number; path: string[]; label: string };

function byName(a: SubjectOption, b: SubjectOption): number {
  return a.name.localeCompare(b.name);
}

export function orderSubjectTree(subjects: SubjectOption[]): OrderedSubject[] {
  const known = new Set(subjects.map((subject) => subject.id));
  const childrenOf = new Map<string, SubjectOption[]>();
  const roots: SubjectOption[] = [];

  for (const subject of subjects) {
    if (!subject.parentId || !known.has(subject.parentId) || subject.parentId === subject.id) {
      roots.push(subject);

      continue;
    }

    childrenOf.set(subject.parentId, [...(childrenOf.get(subject.parentId) ?? []), subject]);
  }

  const ordered: OrderedSubject[] = [];
  const visited = new Set<string>();

  function visit(subject: SubjectOption, parentPath: string[]): void {
    if (visited.has(subject.id)) {
      return;
    }

    visited.add(subject.id);

    const path = [...parentPath, subject.name];

    ordered.push({ subject, depth: parentPath.length, path, label: path.join(PATH_SEPARATOR) });

    for (const child of (childrenOf.get(subject.id) ?? []).sort(byName)) {
      visit(child, path);
    }
  }

  for (const root of roots.sort(byName)) {
    visit(root, []);
  }

  return ordered;
}
