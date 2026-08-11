import { describe, expect, it } from "vitest";
import { collectDescendantNodeIds } from "./collect-descendant-node-ids";

describe("collectDescendantNodeIds", () => {
  const nodes = [
    { id: "root", parentId: null },
    { id: "child-a", parentId: "root" },
    { id: "child-b", parentId: "root" },
    { id: "grandchild-a", parentId: "child-a" },
    { id: "unrelated", parentId: null },
  ];

  it("includes the node itself plus every descendant", () => {
    const ids = collectDescendantNodeIds("root", nodes);

    expect(new Set(ids)).toEqual(new Set(["root", "child-a", "child-b", "grandchild-a"]));
  });

  it("returns only the node itself for a leaf", () => {
    expect(collectDescendantNodeIds("grandchild-a", nodes)).toEqual(["grandchild-a"]);
  });

  it("terminates on a cyclic node list instead of looping forever", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];

    const ids = collectDescendantNodeIds("a", cyclic);

    expect(new Set(ids)).toEqual(new Set(["a", "b"]));
  });

  it("excludes unrelated nodes", () => {
    const ids = collectDescendantNodeIds("root", nodes);

    expect(ids).not.toContain("unrelated");
  });
});
