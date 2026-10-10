export interface SubjectHierarchyRow {
  id: string;
  name: string;
  parentId: string | null;
}

// The subject plus every descendant, at any depth. Visited-set guarded so a
// malformed stored cycle still terminates.
export function collectSubjectSubtreeIds(rootId: string, rows: SubjectHierarchyRow[]): string[] {
  const childrenByParent = new Map<string, string[]>();

  for (const row of rows) {
    if (row.parentId !== null) {
      childrenByParent.set(row.parentId, [...(childrenByParent.get(row.parentId) ?? []), row.id]);
    }
  }

  const visited = new Set<string>([rootId]);
  const subtree = [rootId];

  for (const currentId of subtree) {
    for (const childId of childrenByParent.get(currentId) ?? []) {
      if (!visited.has(childId)) {
        visited.add(childId);
        subtree.push(childId);
      }
    }
  }

  return subtree;
}

// True when making `parentId` the parent of `subjectId` would close a loop:
// the parent is the subject itself, or the subject is one of the parent's ancestors.
export function wouldCreateSubjectCycle(
  subjectId: string,
  parentId: string | null,
  rows: SubjectHierarchyRow[],
): boolean {
  if (parentId === null) {
    return false;
  }

  if (parentId === subjectId) {
    return true;
  }

  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  const visited = new Set<string>();
  let cursor: string | null | undefined = parentId;

  while (cursor !== null && cursor !== undefined && !visited.has(cursor)) {
    if (cursor === subjectId) {
      return true;
    }

    visited.add(cursor);
    cursor = parentById.get(cursor);
  }

  return false;
}

// Every subject a given subject may be moved under: all rows except the subject and its subtree.
export function listValidMoveTargets<T extends SubjectHierarchyRow>(
  subjectId: string,
  rows: T[],
): T[] {
  const excluded = new Set(collectSubjectSubtreeIds(subjectId, rows));

  return rows.filter((row) => !excluded.has(row.id));
}

// "Root › Child › Grandchild". Empty string when the id is not in rows.
export function buildSubjectPathLabel(subjectId: string, rows: SubjectHierarchyRow[]): string {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const names: string[] = [];
  const visited = new Set<string>();
  let cursor = byId.get(subjectId);

  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    names.unshift(cursor.name);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }

  return names.join(" › ");
}

export interface SubjectSiblingSortable {
  name: string;
  sortOrder?: number | null;
}

// Sibling order: explicit sort_order ascending, subjects without one last, then by name.
export function compareSubjectSiblings(a: SubjectSiblingSortable, b: SubjectSiblingSortable): number {
  const aOrder = a.sortOrder ?? null;
  const bOrder = b.sortOrder ?? null;

  if (aOrder !== bOrder) {
    if (aOrder === null) {
      return 1;
    }

    if (bOrder === null) {
      return -1;
    }

    return aOrder - bOrder;
  }

  return a.name.localeCompare(b.name);
}

// Names of the subject's ancestors, root first. Empty for a root or an unknown id.
export function listSubjectAncestorNames(subjectId: string, rows: SubjectHierarchyRow[]): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const names: string[] = [];
  const visited = new Set<string>([subjectId]);
  let cursor = byId.get(subjectId)?.parentId ?? null;

  while (cursor !== null && !visited.has(cursor)) {
    const row = byId.get(cursor);

    if (!row) {
      break;
    }

    visited.add(cursor);
    names.unshift(row.name);
    cursor = row.parentId;
  }

  return names;
}
