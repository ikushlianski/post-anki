import { describe, expect, it } from "vitest";
import type { DomainNodeTreeItem } from "@post-anki/shared";
import {
  MAX_RECOMMENDATIONS_PER_AXIS,
  WELL_MASTERED_THRESHOLD,
  buildDeepenReason,
  buildWidenReason,
  computeDeepenCandidates,
  computeWidenCandidates,
} from "./domain-recommendation";

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
    source: "static_taxonomy",
    kind: null,
    ...overrides,
  };
}

// AC 1, 5, 10 — a mastered parent with an uncovered, curriculum-free child.
describe("computeDeepenCandidates — a well-mastered parent's gap child", () => {
  it("emits a deepen candidate naming the child, sourced from the mastered parent (AC 1)", () => {
    const child = makeNode({ id: "dns", parentId: "tcp-ip", name: "DNS", percent: 0 });
    const parent = makeNode({
      id: "tcp-ip",
      name: "TCP/IP",
      percent: 92,
      children: [child],
    });

    const candidates = computeDeepenCandidates([parent]);

    expect(candidates).toEqual([
      {
        domainNodeId: "dns",
        sourceNodeId: "tcp-ip",
        axis: "deepen",
        reason: buildDeepenReason(parent, child),
      },
    ]);
  });

  it("interpolates only the real name/percent values from the tree (AC 10)", () => {
    const child = makeNode({ id: "dns", parentId: "tcp-ip", name: "DNS", percent: 0 });
    const parent = makeNode({ id: "tcp-ip", name: "TCP/IP", percent: 92, children: [child] });

    const [candidate] = computeDeepenCandidates([parent]);

    expect(candidate!.reason).toBe(
      'You\'ve mastered "TCP/IP" (92%) — "DNS" is the next step within it.',
    );
  });

  it("excludes a child that already has a curriculum mapped, regardless of percent (AC 2)", () => {
    const coveredChild = makeNode({
      id: "dns",
      parentId: "tcp-ip",
      percent: 0,
      curricula: [{ id: "cur-1", name: "DNS course" }],
    });
    const parent = makeNode({ id: "tcp-ip", percent: 92, children: [coveredChild] });

    expect(computeDeepenCandidates([parent])).toEqual([]);
  });

  it("excludes a child with any non-zero progress, even without a curriculum", () => {
    const inProgressChild = makeNode({ id: "dns", parentId: "tcp-ip", percent: 30 });
    const parent = makeNode({ id: "tcp-ip", percent: 92, children: [inProgressChild] });

    expect(computeDeepenCandidates([parent])).toEqual([]);
  });

  it("excludes every child of a parent below the mastery threshold (AC 3)", () => {
    const routing = makeNode({ id: "routing", percent: WELL_MASTERED_THRESHOLD - 1 });
    const dynamicRouting = makeNode({
      id: "dynamic-routing",
      parentId: "routing",
      percent: 0,
    });
    routing.children = [dynamicRouting];

    expect(computeDeepenCandidates([routing])).toEqual([]);
  });

  it("treats the threshold itself as mastered (percent === 80 qualifies)", () => {
    const child = makeNode({ id: "child-1", parentId: "parent-1", percent: 0 });
    const parent = makeNode({
      id: "parent-1",
      percent: WELL_MASTERED_THRESHOLD,
      children: [child],
    });

    expect(computeDeepenCandidates([parent])).toHaveLength(1);
  });

  it("excludes a candidate where the parent is an Area node (AC 4)", () => {
    const child = makeNode({ id: "child-1", parentId: "area-1", percent: 0 });
    const areaParent = makeNode({
      id: "area-1",
      percent: 92,
      kind: "area",
      children: [child],
    });

    expect(computeDeepenCandidates([areaParent])).toEqual([]);
  });

  it("excludes a candidate where the child is an Area node (AC 4)", () => {
    const areaChild = makeNode({ id: "area-child", parentId: "parent-1", percent: 0, kind: "area" });
    const parent = makeNode({ id: "parent-1", percent: 92, children: [areaChild] });

    expect(computeDeepenCandidates([parent])).toEqual([]);
  });

  it("returns at most 5 candidates, sorted by descending parent percent, when more than 5 qualify (AC 5)", () => {
    const roots = [70, 100, 85, 95, 80, 90, 82].map((percent, index) => {
      const child = makeNode({ id: `child-${index}`, parentId: `root-${index}`, percent: 0 });

      return makeNode({ id: `root-${index}`, percent, children: [child] });
    });

    const candidates = computeDeepenCandidates(roots);

    expect(candidates).toHaveLength(MAX_RECOMMENDATIONS_PER_AXIS);
    expect(candidates.map((c) => c.sourceNodeId)).toEqual([
      "root-1",
      "root-3",
      "root-5",
      "root-2",
      "root-6",
    ]);
  });

  it("walks the whole tree, not just root-level parents", () => {
    const grandchild = makeNode({ id: "grandchild-1", parentId: "child-1", percent: 0 });
    const child = makeNode({
      id: "child-1",
      parentId: "root-1",
      percent: 85,
      children: [grandchild],
    });
    const root = makeNode({ id: "root-1", percent: 10, children: [child] });

    const candidates = computeDeepenCandidates([root]);

    expect(candidates).toEqual([
      {
        domainNodeId: "grandchild-1",
        sourceNodeId: "child-1",
        axis: "deepen",
        reason: buildDeepenReason(child, grandchild),
      },
    ]);
  });
});

// AC 6, 7, 8, 9, 10.
describe("computeWidenCandidates — a sibling domain with zero coverage", () => {
  it("only ever considers root-level nodes — a qualifying non-root sibling pair produces nothing (AC 6)", () => {
    const vpn = makeNode({ id: "vpn", parentId: "network-security", percent: 0 });
    const networkSecurity = makeNode({
      id: "network-security",
      parentId: "networking",
      percent: 0,
      children: [vpn],
    });
    const networking = makeNode({
      id: "networking",
      percent: 60,
      curricula: [{ id: "cur-1", name: "Networking course" }],
      children: [networkSecurity],
    });

    expect(computeWidenCandidates([networking])).toEqual([]);
  });

  it("returns no candidates when every root has curricula.length === 0 (AC 7)", () => {
    const rootA = makeNode({ id: "root-a", percent: 0 });
    const rootB = makeNode({ id: "root-b", percent: 0 });

    expect(computeWidenCandidates([rootA, rootB])).toEqual([]);
  });

  it("emits a candidate for each uncovered root, sourced from the highest-percent active root (AC 8)", () => {
    const networking = makeNode({
      id: "networking",
      percent: 40,
      curricula: [{ id: "cur-1", name: "Networking course" }],
    });
    const security = makeNode({
      id: "security",
      percent: 70,
      curricula: [{ id: "cur-2", name: "Security course" }],
    });
    const cloudComputing = makeNode({ id: "cloud-computing", percent: 0 });
    const music = makeNode({ id: "music", percent: 0 });

    const candidates = computeWidenCandidates([networking, security, cloudComputing, music]);

    expect(candidates).toEqual([
      {
        domainNodeId: "cloud-computing",
        sourceNodeId: "security",
        axis: "widen",
        reason: buildWidenReason(security, cloudComputing),
      },
      {
        domainNodeId: "music",
        sourceNodeId: "security",
        axis: "widen",
        reason: buildWidenReason(security, music),
      },
    ]);
  });

  it("excludes a root with any non-zero progress, even without a curriculum", () => {
    const active = makeNode({
      id: "active",
      percent: 50,
      curricula: [{ id: "cur-1", name: "c" }],
    });
    const inProgress = makeNode({ id: "in-progress", percent: 20 });

    expect(computeWidenCandidates([active, inProgress])).toEqual([]);
  });

  it("returns at most 5 candidates, in stable tree order, when more than 5 qualify (AC 9)", () => {
    const active = makeNode({
      id: "active",
      percent: 50,
      curricula: [{ id: "cur-1", name: "c" }],
    });
    const gaps = Array.from({ length: 7 }, (_, index) => makeNode({ id: `gap-${index}`, percent: 0 }));

    const candidates = computeWidenCandidates([active, ...gaps]);

    expect(candidates).toHaveLength(MAX_RECOMMENDATIONS_PER_AXIS);
    expect(candidates.map((c) => c.domainNodeId)).toEqual([
      "gap-0",
      "gap-1",
      "gap-2",
      "gap-3",
      "gap-4",
    ]);
  });

  it("interpolates only the real name/percent values from the tree (AC 10)", () => {
    const active = makeNode({
      id: "networking",
      name: "Networking",
      percent: 40,
      curricula: [{ id: "cur-1", name: "c" }],
    });
    const gap = makeNode({ id: "cloud", name: "Cloud Computing", percent: 0 });

    const [candidate] = computeWidenCandidates([active, gap]);

    expect(candidate!.reason).toBe(
      '"Networking" is actively being studied while "Cloud Computing", a sibling knowledge domain, hasn\'t been started yet.',
    );
  });
});
