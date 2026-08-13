const MAX_DEPTH = 6;

export interface NoteTaxonomyDomainNodeRef {
  id: string;
  parentId: string | null;
}

export interface NoteTaxonomyCandidate {
  noteId: string;
  domainNodeIds: string[];
}

export function resolveNoteTaxonomySubtree(
  filterNodeId: string,
  nodes: NoteTaxonomyDomainNodeRef[],
  candidates: NoteTaxonomyCandidate[],
): string[] {
  const subtreeIds = new Set<string>();
  let frontier = [filterNodeId];
  let depth = 0;

  while (frontier.length > 0 && depth <= MAX_DEPTH) {
    const nextFrontier: string[] = [];

    for (const id of frontier) {
      if (subtreeIds.has(id)) {
        continue;
      }

      subtreeIds.add(id);

      const children = nodes.filter((node) => node.parentId === id);

      for (const child of children) {
        if (!subtreeIds.has(child.id)) {
          nextFrontier.push(child.id);
        }
      }
    }

    frontier = nextFrontier;
    depth += 1;
  }

  return candidates
    .filter((candidate) => candidate.domainNodeIds.some((id) => subtreeIds.has(id)))
    .map((candidate) => candidate.noteId);
}
