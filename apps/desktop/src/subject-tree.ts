import type { Subject } from "@/api/desktop-commands";

export type SubjectNode = { subject: Subject; children: SubjectNode[] };

export type FlatSubject = { subject: Subject; depth: number; hasChildren: boolean };

const PATH_SEPARATOR = " / ";

function byName(a: Subject, b: Subject): number {
  return a.name.localeCompare(b.name);
}

function hasValidParent(subject: Subject, ids: Set<string>): boolean {
  return subject.parentId !== null && subject.parentId !== subject.id && ids.has(subject.parentId);
}

export function buildSubjectTree(subjects: Subject[]): SubjectNode[] {
  const ids = new Set(subjects.map((subject) => subject.id));
  const childrenByParent = new Map<string, Subject[]>();

  for (const subject of subjects) {
    if (!hasValidParent(subject, ids)) continue;

    const siblings = childrenByParent.get(subject.parentId as string) ?? [];
    siblings.push(subject);
    childrenByParent.set(subject.parentId as string, siblings);
  }

  const visited = new Set<string>();

  function build(subject: Subject): SubjectNode {
    visited.add(subject.id);

    const children = (childrenByParent.get(subject.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .sort(byName)
      .map(build);

    return { subject, children };
  }

  const roots = subjects.filter((subject) => !hasValidParent(subject, ids)).sort(byName);
  const nodes = roots.map(build);

  for (const subject of [...subjects].sort(byName)) {
    if (!visited.has(subject.id)) nodes.push(build(subject));
  }

  return nodes;
}

export function flattenWithDepth(
  nodes: SubjectNode[],
  expandedIds: ReadonlySet<string>,
  depth = 0,
): FlatSubject[] {
  return nodes.flatMap((node) => {
    const row = { subject: node.subject, depth, hasChildren: node.children.length > 0 };
    const descendants = expandedIds.has(node.subject.id)
      ? flattenWithDepth(node.children, expandedIds, depth + 1)
      : [];

    return [row, ...descendants];
  });
}

export function countDescendants(subjectId: string, all: Subject[], seen = new Set<string>()): number {
  seen.add(subjectId);

  return all
    .filter((item) => item.parentId === subjectId && !seen.has(item.id))
    .reduce((total, child) => total + 1 + countDescendants(child.id, all, seen), 0);
}

export function subjectPath(subject: Subject, all: Subject[]): string {
  const byId = new Map(all.map((item) => [item.id, item]));
  const seen = new Set<string>([subject.id]);
  const names = [subject.name];
  let parentId = subject.parentId;

  while (parentId !== null && byId.has(parentId) && !seen.has(parentId)) {
    const parent = byId.get(parentId) as Subject;

    seen.add(parent.id);
    names.unshift(parent.name);
    parentId = parent.parentId;
  }

  return names.join(PATH_SEPARATOR);
}
