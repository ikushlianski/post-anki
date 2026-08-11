import { describe, expect, it } from "vitest";
import { resolvePathOrder } from "./resolve-path-order";

describe("resolvePathOrder", () => {
  it("orders targets by their prerequisite edges when edges exist among them", () => {
    const order = resolvePathOrder(
      ["react", "html-css-js", "js-fundamentals"],
      [
        { id: "react", order: 3 },
        { id: "html-css-js", order: 0 },
        { id: "js-fundamentals", order: 1 },
      ],
      [
        { domainNodeId: "react", prerequisiteNodeId: "js-fundamentals" },
        { domainNodeId: "js-fundamentals", prerequisiteNodeId: "html-css-js" },
      ],
    );

    expect(order).toEqual(["html-css-js", "js-fundamentals", "react"]);
  });

  it("falls back to taxonomy order, deterministically, when no edges apply among the targets", () => {
    const targetNodeIds = ["react-area-c", "react-area-a", "react-area-b"];
    const nodes = [
      { id: "react-area-a", order: 0 },
      { id: "react-area-b", order: 1 },
      { id: "react-area-c", order: 2 },
    ];

    const first = resolvePathOrder(targetNodeIds, nodes, []);
    const second = resolvePathOrder(targetNodeIds, nodes, []);

    expect(first).toEqual(["react-area-a", "react-area-b", "react-area-c"]);
    expect(second).toEqual(first);
  });

  it("ignores an edge that points outside the target set", () => {
    const order = resolvePathOrder(
      ["react", "nodejs"],
      [
        { id: "react", order: 0 },
        { id: "nodejs", order: 1 },
      ],
      [{ domainNodeId: "react", prerequisiteNodeId: "networking" }],
    );

    expect(order).toEqual(["react", "nodejs"]);
  });

  it("preserves original relative order for targets tied on taxonomy order across two different parents", () => {
    const order = resolvePathOrder(
      ["react-area-0", "nodejs-area-0", "react-area-1", "nodejs-area-1"],
      [
        { id: "react-area-0", order: 0 },
        { id: "nodejs-area-0", order: 0 },
        { id: "react-area-1", order: 1 },
        { id: "nodejs-area-1", order: 1 },
      ],
      [],
    );

    expect(order).toEqual(["react-area-0", "nodejs-area-0", "react-area-1", "nodejs-area-1"]);
  });

  it("degrades safely to taxonomy order when the targets' edges form a cycle", () => {
    const order = resolvePathOrder(
      ["a", "b"],
      [
        { id: "a", order: 0 },
        { id: "b", order: 1 },
      ],
      [
        { domainNodeId: "a", prerequisiteNodeId: "b" },
        { domainNodeId: "b", prerequisiteNodeId: "a" },
      ],
    );

    expect(order).toEqual(["a", "b"]);
  });

  it("ignores a self-referential edge rather than deadlocking that node", () => {
    const order = resolvePathOrder(
      ["a", "b"],
      [
        { id: "a", order: 0 },
        { id: "b", order: 1 },
      ],
      [{ domainNodeId: "a", prerequisiteNodeId: "a" }],
    );

    expect(order).toEqual(["a", "b"]);
  });

  it("returns an empty array for an empty target set", () => {
    expect(resolvePathOrder([], [], [])).toEqual([]);
  });

  it("treats a target missing from the nodes list as taxonomy order 0", () => {
    const order = resolvePathOrder(["missing", "known"], [{ id: "known", order: 5 }], []);

    expect(order).toEqual(["missing", "known"]);
  });
});
