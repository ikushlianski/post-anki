import { describe, it, expect } from "vitest";
import type { DomainNodeTreeItem } from "@post-anki/shared";
import { computeDomainMapLayout, defaultCollapsedNodeIds } from "./domain-map-layout";

// visual-knowledge-map (issue #86), SCENARIO 3, 4, 7, 9 — computeDomainMapLayout
// and defaultCollapsedNodeIds are the graph view's only new derivers: pure,
// synchronous, no DOM, same class of function as domainNodeProgress/isAncestor
// tested elsewhere in this package.

function makeNode(overrides: Partial<DomainNodeTreeItem> & { id: string }): DomainNodeTreeItem {
  return {
    subjectId: "sub-1",
    parentId: null,
    name: overrides.id,
    description: null,
    order: 0,
    percent: 0,
    targetDepth: null,
    priorityDistance: null,
    curricula: [],
    children: [],
    supersededAt: null,
    supersededReason: null,
    source: "ai_generated",
    kind: null,
    ...overrides,
  };
}

function threeLevelTree(): DomainNodeTreeItem[] {
  const grandchild = makeNode({ id: "grandchild-1", parentId: "child-1" });
  const child1 = makeNode({ id: "child-1", parentId: "root-1", children: [grandchild] });
  const child2 = makeNode({ id: "child-2", parentId: "root-1" });
  const root = makeNode({ id: "root-1", children: [child1, child2] });

  return [root];
}

function wideTree({
  rootCount,
  childrenPerRoot,
  grandchildrenPerChild,
}: {
  rootCount: number;
  childrenPerRoot: number;
  grandchildrenPerChild: number;
}): DomainNodeTreeItem[] {
  const roots: DomainNodeTreeItem[] = [];

  for (let r = 0; r < rootCount; r += 1) {
    const children: DomainNodeTreeItem[] = [];

    for (let c = 0; c < childrenPerRoot; c += 1) {
      const grandchildren: DomainNodeTreeItem[] = [];

      for (let g = 0; g < grandchildrenPerChild; g += 1) {
        grandchildren.push(makeNode({ id: `root${r}-child${c}-grandchild${g}` }));
      }

      children.push(makeNode({ id: `root${r}-child${c}`, children: grandchildren }));
    }

    roots.push(makeNode({ id: `root${r}`, children }));
  }

  return roots;
}

describe("computeDomainMapLayout", () => {
  it("includes every node exactly once and one edge per parent-child pair when nothing is collapsed", () => {
    const tree = threeLevelTree();

    const layout = computeDomainMapLayout(tree, new Set());

    expect(layout.nodes).toHaveLength(4);
    expect(new Set(layout.nodes.map((n) => n.id)).size).toBe(4);
    expect(layout.edges).toHaveLength(3);
    expect(layout.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "root-1", target: "child-1" }),
        expect.objectContaining({ source: "root-1", target: "child-2" }),
        expect.objectContaining({ source: "child-1", target: "grandchild-1" }),
      ]),
    );
  });

  it("reports correct depth, hasChildren, and childCount for each node", () => {
    const tree = threeLevelTree();

    const layout = computeDomainMapLayout(tree, new Set());
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));

    expect(byId.get("root-1")).toMatchObject({ depth: 0, hasChildren: true, childCount: 2 });
    expect(byId.get("child-1")).toMatchObject({ depth: 1, hasChildren: true, childCount: 1 });
    expect(byId.get("child-2")).toMatchObject({ depth: 1, hasChildren: false, childCount: 0 });
    expect(byId.get("grandchild-1")).toMatchObject({ depth: 2, hasChildren: false, childCount: 0 });
  });

  it("excludes an entire subtree, at any depth, when its root id is collapsed", () => {
    const tree = threeLevelTree();

    const layout = computeDomainMapLayout(tree, new Set(["child-1"]));

    const ids = layout.nodes.map((n) => n.id);

    expect(ids).toContain("child-1");
    expect(ids).not.toContain("grandchild-1");
    expect(layout.edges.map((e) => e.target)).not.toContain("grandchild-1");
  });

  it("flags a node's edge as highlighted when the node itself has curricula", () => {
    const covered = makeNode({ id: "covered", parentId: "root-1", curricula: [{ id: "c1", name: "Course" }] });
    const root = makeNode({ id: "root-1", children: [covered] });

    const layout = computeDomainMapLayout([root], new Set());

    const edge = layout.edges.find((e) => e.target === "covered");

    expect(edge?.highlighted).toBe(true);
  });

  it("flags an ancestor's edge as highlighted when a descendant (still visible or collapsed away) has curricula", () => {
    const grandchild = makeNode({
      id: "grandchild-1",
      parentId: "child-1",
      curricula: [{ id: "c1", name: "Course" }],
    });
    const child1 = makeNode({ id: "child-1", parentId: "root-1", children: [grandchild] });
    const root = makeNode({ id: "root-1", children: [child1] });

    const expandedLayout = computeDomainMapLayout([root], new Set());
    const collapsedLayout = computeDomainMapLayout([root], new Set(["child-1"]));

    expect(expandedLayout.edges.find((e) => e.target === "child-1")?.highlighted).toBe(true);
    expect(collapsedLayout.edges.find((e) => e.target === "child-1")?.highlighted).toBe(true);
  });

  it("does not flag a true, unaddressed gap's edge as highlighted", () => {
    const uncovered = makeNode({ id: "uncovered", parentId: "root-1", percent: 0, curricula: [] });
    const root = makeNode({ id: "root-1", children: [uncovered] });

    const layout = computeDomainMapLayout([root], new Set());

    expect(layout.edges.find((e) => e.target === "uncovered")?.highlighted).toBe(false);
  });

  it("does not throw on a cyclic input, which real API data can never produce", () => {
    const child: DomainNodeTreeItem = makeNode({ id: "child", parentId: "root" });
    const root: DomainNodeTreeItem = makeNode({ id: "root", children: [child] });

    (child as { children: DomainNodeTreeItem[] }).children = [root];

    expect(() => computeDomainMapLayout([root], new Set())).not.toThrow();
  });

  it("does not choke at scale: renders every node exactly once for a 75-node forest", () => {
    const forest = wideTree({ rootCount: 3, childrenPerRoot: 4, grandchildrenPerChild: 5 });
    const totalNodes = 3 + 3 * 4 + 3 * 4 * 5;

    const layout = computeDomainMapLayout(forest, new Set());

    expect(totalNodes).toBe(75);
    expect(layout.nodes).toHaveLength(75);
    expect(layout.edges).toHaveLength(75 - 3);
  });

  it("bounds the initial render to the depth-0/1 node count for a 75-node, 3-level taxonomy (SCENARIO 9)", () => {
    const forest = wideTree({ rootCount: 3, childrenPerRoot: 4, grandchildrenPerChild: 5 });
    const collapsed = defaultCollapsedNodeIds(forest);

    const layout = computeDomainMapLayout(forest, collapsed);

    expect(layout.nodes).toHaveLength(3 + 3 * 4);
    expect(layout.nodes.every((n) => n.depth <= 1)).toBe(true);
  });

  it("reveals only the direct children of an expanded depth-1 node, not its grandchildren", () => {
    const forest = wideTree({ rootCount: 1, childrenPerRoot: 1, grandchildrenPerChild: 3 });
    const collapsed = defaultCollapsedNodeIds(forest);
    const depthOneId = "root0-child0";

    collapsed.delete(depthOneId);

    const layout = computeDomainMapLayout(forest, collapsed);
    const depths = layout.nodes.map((n) => n.depth);

    expect(depths.filter((d) => d === 2)).toHaveLength(3);
    expect(Math.max(...depths)).toBe(2);
  });
});

describe("defaultCollapsedNodeIds", () => {
  it("collapses every node at depth 1 or deeper, and never the depth-0 root", () => {
    const tree = threeLevelTree();

    const collapsed = defaultCollapsedNodeIds(tree);

    expect(collapsed.has("root-1")).toBe(false);
    expect(collapsed.has("child-1")).toBe(true);
    expect(collapsed.has("child-2")).toBe(true);
    expect(collapsed.has("grandchild-1")).toBe(true);
  });
});
