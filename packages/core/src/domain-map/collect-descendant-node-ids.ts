import type { DomainNodeRef } from "./domain-map-progress";

const MAX_DEPTH = 6;

export function collectDescendantNodeIds(nodeId: string, nodes: DomainNodeRef[]): string[] {
  const subtreeIds = new Set<string>();
  let frontier = [nodeId];
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

  return [...subtreeIds];
}
