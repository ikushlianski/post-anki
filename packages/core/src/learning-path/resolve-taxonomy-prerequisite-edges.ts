// learning-paths (module 1), SCENARIO 14 — the pure resolution step behind
// seed-domain-taxonomy.ts's two-pass prerequisite seeding. `yamlIdToNodeId`
// must already be the COMPLETE map across every root in every taxonomy YAML
// file before this runs (the seed script builds it during its own node-
// insertion pass); that is what makes a forward reference (e.g.
// cloud-computing's prerequisites naming networking, declared earlier in
// the file) resolve correctly regardless of declaration order — resolution
// never depends on insertion order, only on the map being complete first.
//
// A prerequisite id absent from the map is dropped, never thrown — a
// dangling id is a YAML typo, not a reason to abort seeding the rest of the
// taxonomy (spec.md's Derivers table).
export interface TaxonomyPrerequisiteNode {
  yamlId: string;
  prerequisiteYamlIds: string[];
}

export interface TaxonomyPrerequisiteEdge {
  domainNodeId: string;
  prerequisiteNodeId: string;
}

export function resolveTaxonomyPrerequisiteEdges(
  yamlIdToNodeId: Map<string, string>,
  nodes: TaxonomyPrerequisiteNode[],
): TaxonomyPrerequisiteEdge[] {
  const edges: TaxonomyPrerequisiteEdge[] = [];

  for (const node of nodes) {
    const domainNodeId = yamlIdToNodeId.get(node.yamlId);

    if (!domainNodeId) {
      continue;
    }

    for (const prerequisiteYamlId of node.prerequisiteYamlIds) {
      const prerequisiteNodeId = yamlIdToNodeId.get(prerequisiteYamlId);

      if (!prerequisiteNodeId) {
        continue;
      }

      edges.push({ domainNodeId, prerequisiteNodeId });
    }
  }

  return edges;
}
