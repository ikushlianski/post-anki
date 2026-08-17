import { describe, expect, it } from "vitest";
import { detectYamlIdConflict } from "./detect-yaml-id-conflict";

describe("detectYamlIdConflict", () => {
  it("returns null the first time a yamlId is seen", () => {
    const map = new Map<string, string>();

    expect(detectYamlIdConflict(map, "networking", "dnode_1")).toBeNull();
  });

  it("returns null when the same yamlId resolves to the same nodeId again", () => {
    const map = new Map([["web-development", "dnode_1"]]);

    // The legitimate case: web-dev-areas.yaml re-declaring the Web
    // Development scaffold, which the existence check resolves onto the
    // same node it-taxonomy.yaml already seeded.
    expect(detectYamlIdConflict(map, "web-development", "dnode_1")).toBeNull();
  });

  it("returns a conflict when the same yamlId resolves to two different nodeIds", () => {
    const map = new Map([["log-aggregation", "dnode_1"]]);

    expect(detectYamlIdConflict(map, "log-aggregation", "dnode_2")).toEqual({
      yamlId: "log-aggregation",
      previousNodeId: "dnode_1",
      nodeId: "dnode_2",
    });
  });
});
