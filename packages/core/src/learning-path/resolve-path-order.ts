export interface PathOrderNode {
  id: string;
  order: number;
}

export interface PathPrerequisiteEdge {
  domainNodeId: string;
  prerequisiteNodeId: string;
}

export function resolvePathOrder(
  targetNodeIds: string[],
  nodes: PathOrderNode[],
  prerequisiteEdges: PathPrerequisiteEdge[],
): string[] {
  const orderById = new Map(nodes.map((node) => [node.id, node.order]));
  const targetSet = new Set(targetNodeIds);

  const byTaxonomyOrder = (a: string, b: string): number =>
    (orderById.get(a) ?? 0) - (orderById.get(b) ?? 0);

  const fallback = (): string[] => [...targetNodeIds].sort(byTaxonomyOrder);

  const relevantEdges = prerequisiteEdges.filter(
    (edge) =>
      edge.domainNodeId !== edge.prerequisiteNodeId &&
      targetSet.has(edge.domainNodeId) &&
      targetSet.has(edge.prerequisiteNodeId),
  );

  if (relevantEdges.length === 0) {
    return fallback();
  }

  const dependentsByPrerequisite = new Map<string, string[]>();
  const inDegree = new Map<string, number>(targetNodeIds.map((id) => [id, 0]));

  for (const edge of relevantEdges) {
    inDegree.set(edge.domainNodeId, (inDegree.get(edge.domainNodeId) ?? 0) + 1);

    const dependents = dependentsByPrerequisite.get(edge.prerequisiteNodeId) ?? [];
    dependents.push(edge.domainNodeId);
    dependentsByPrerequisite.set(edge.prerequisiteNodeId, dependents);
  }

  const queue = targetNodeIds.filter((id) => inDegree.get(id) === 0).sort(byTaxonomyOrder);
  const result: string[] = [];

  while (queue.length > 0) {
    const next = queue.shift()!;
    result.push(next);

    const dependents = dependentsByPrerequisite.get(next) ?? [];
    let requeued = false;

    for (const dependent of dependents) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);

      if (remaining === 0) {
        queue.push(dependent);
        requeued = true;
      }
    }

    if (requeued) {
      queue.sort(byTaxonomyOrder);
    }
  }

  if (result.length !== targetNodeIds.length) {
    return fallback();
  }

  return result;
}
