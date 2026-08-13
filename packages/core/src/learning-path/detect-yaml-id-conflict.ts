// learning-paths (module 1) — a guard for seed-domain-taxonomy.ts's
// yamlId -> domainNodeId map (the same map resolveTaxonomyPrerequisiteEdges
// consumes). A yamlId legitimately gets recorded more than once when
// web-dev-areas.yaml re-declares the Web Development/Frontend/Backend
// scaffold by name to resolve onto it-taxonomy.yaml's own rows — the
// seed script's existing-check resolves both declarations to the SAME
// nodeId, which is not a conflict. Two genuinely different nodes colliding
// on the same yamlId (a YAML authoring bug — it-taxonomy.yaml is meant to
// have unique ids) IS a conflict: silently taking "last write wins" would
// misattribute prerequisite edges to whichever node happened to seed last.
export interface YamlIdConflict {
  yamlId: string;
  previousNodeId: string;
  nodeId: string;
}

export function detectYamlIdConflict(
  yamlIdToNodeId: Map<string, string>,
  yamlId: string,
  nodeId: string,
): YamlIdConflict | null {
  const previousNodeId = yamlIdToNodeId.get(yamlId);

  if (previousNodeId !== undefined && previousNodeId !== nodeId) {
    return { yamlId, previousNodeId, nodeId };
  }

  return null;
}
