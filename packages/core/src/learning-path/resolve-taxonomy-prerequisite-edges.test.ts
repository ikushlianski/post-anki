import { describe, expect, it } from "vitest";
import { resolveTaxonomyPrerequisiteEdges } from "./resolve-taxonomy-prerequisite-edges";

describe("resolveTaxonomyPrerequisiteEdges", () => {
  it("resolves an edge when both the node and its prerequisite are in the map", () => {
    const map = new Map([
      ["tcp-ip", "dnode_1"],
      ["dns", "dnode_2"],
    ]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "dns", prerequisiteYamlIds: ["tcp-ip"] },
    ]);

    expect(edges).toEqual([{ domainNodeId: "dnode_2", prerequisiteNodeId: "dnode_1" }]);
  });

  it("resolves a forward reference — a prerequisite declared later in yamlId order than the node naming it", () => {
    const map = new Map([
      ["networking", "dnode_early"],
      ["cloud-computing", "dnode_late"],
    ]);

    // Simulates cloud-computing (declared far later in the file) naming
    // networking (declared much earlier) as a prerequisite — resolution
    // must not care about which order the two were inserted into the map.
    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "cloud-computing", prerequisiteYamlIds: ["networking"] },
    ]);

    expect(edges).toEqual([{ domainNodeId: "dnode_late", prerequisiteNodeId: "dnode_early" }]);
  });

  it("resolves a cross-branch reference between two unrelated root domains", () => {
    const map = new Map([
      ["static-routing", "dnode_a"],
      ["dynamic-routing", "dnode_b"],
      ["group-policy", "dnode_c"],
      ["active-directory", "dnode_d"],
    ]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "dynamic-routing", prerequisiteYamlIds: ["static-routing"] },
      { yamlId: "group-policy", prerequisiteYamlIds: ["active-directory"] },
    ]);

    expect(edges).toEqual([
      { domainNodeId: "dnode_b", prerequisiteNodeId: "dnode_a" },
      { domainNodeId: "dnode_c", prerequisiteNodeId: "dnode_d" },
    ]);
  });

  it("drops a prerequisite id absent from the map instead of throwing", () => {
    const map = new Map([["dns", "dnode_1"]]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "dns", prerequisiteYamlIds: ["nonexistent-typo"] },
    ]);

    expect(edges).toEqual([]);
  });

  it("drops the whole node's edges when the node's own yamlId is absent from the map", () => {
    const map = new Map([["tcp-ip", "dnode_1"]]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "unmapped-node", prerequisiteYamlIds: ["tcp-ip"] },
    ]);

    expect(edges).toEqual([]);
  });

  it("produces one edge per prerequisite when a node names more than one", () => {
    const map = new Map([
      ["networking", "dnode_net"],
      ["virtualization-containerization", "dnode_virt"],
      ["cloud-computing", "dnode_cloud"],
    ]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      {
        yamlId: "cloud-computing",
        prerequisiteYamlIds: ["networking", "virtualization-containerization"],
      },
    ]);

    expect(edges).toEqual([
      { domainNodeId: "dnode_cloud", prerequisiteNodeId: "dnode_net" },
      { domainNodeId: "dnode_cloud", prerequisiteNodeId: "dnode_virt" },
    ]);
  });

  it("returns an empty array for an empty node list", () => {
    expect(resolveTaxonomyPrerequisiteEdges(new Map(), [])).toEqual([]);
  });

  it("returns an empty array when every node has no prerequisites", () => {
    const map = new Map([["networking", "dnode_1"]]);

    const edges = resolveTaxonomyPrerequisiteEdges(map, [
      { yamlId: "networking", prerequisiteYamlIds: [] },
    ]);

    expect(edges).toEqual([]);
  });
});
