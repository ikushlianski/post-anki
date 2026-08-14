import { hierarchy } from "d3-hierarchy";
import { describe, it, expect } from "vitest";
import {
  radiusForDepth,
  positionRadial,
  MIN_RADIAL_STEP,
  MIN_NODE_ARC_LENGTH,
  MIN_NODE_SEPARATION_PX,
} from "./domain-map-radial-layout";

// #86 widened (mind-map/tree-hierarchy dual view), SCENARIO 6/7 —
// radiusForDepth/positionRadial are the new radial math: pure, synchronous,
// no DOM/React/network dependency, same class of function as
// computeDomainMapLayout tested in domain-map-layout.test.ts.

// The real seeded taxonomy's actual top-level domain count, per
// apps/api/scripts/seed-data/it-taxonomy.yaml (`grep -c "^  - id:"` = 15,
// re-verified during this ticket's own planning, spec.md's "Verified facts").
// Hardcoded here rather than loaded from the yaml file directly since
// packages/core has no dependency on apps/api's seed data at build time.
const REAL_TAXONOMY_TOP_LEVEL_DOMAIN_COUNT = 15;

interface FixtureNode {
  id: string;
  children: FixtureNode[];
}

function makeFixtureNode(id: string, children: FixtureNode[] = []): FixtureNode {
  return { id, children };
}

// Mirrors buildVisibleTree's own synthetic-sentinel-wraps-a-forest shape
// (domain-map-layout.ts) so positionRadial is exercised the same way
// computeDomainMapLayout actually calls it, without pulling in that file's
// DomainNodeTreeItem-specific plumbing.
function taxonomyShapedFixture({
  topLevelCount,
  childrenPerTopLevel,
  grandchildrenPerChild,
}: {
  topLevelCount: number;
  childrenPerTopLevel: number;
  grandchildrenPerChild: number;
}): FixtureNode {
  const roots: FixtureNode[] = [];

  for (let t = 0; t < topLevelCount; t += 1) {
    const children: FixtureNode[] = [];

    for (let c = 0; c < childrenPerTopLevel; c += 1) {
      const grandchildren: FixtureNode[] = [];

      for (let g = 0; g < grandchildrenPerChild; g += 1) {
        grandchildren.push(makeFixtureNode(`top${t}-child${c}-grandchild${g}`));
      }

      children.push(makeFixtureNode(`top${t}-child${c}`, grandchildren));
    }

    roots.push(makeFixtureNode(`top${t}`, children));
  }

  return makeFixtureNode("__sentinel-root__", roots);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

describe("radiusForDepth", () => {
  it("always returns 0 at depth 0, regardless of how many nodes share that depth", () => {
    expect(radiusForDepth(0, 1)).toBe(0);
    expect(radiusForDepth(0, 15)).toBe(0);
  });

  it("sizes the real 15-domain top-level ring wide enough that every domain stays at least MIN_NODE_ARC_LENGTH apart along the arc", () => {
    const radius = radiusForDepth(1, REAL_TAXONOMY_TOP_LEVEL_DOMAIN_COUNT);
    const arcSpacing = (2 * Math.PI * radius) / REAL_TAXONOMY_TOP_LEVEL_DOMAIN_COUNT;

    expect(arcSpacing).toBeGreaterThanOrEqual(MIN_NODE_ARC_LENGTH);
  });

  it("keeps a synthetic worst-case ring of 40+ siblings spaced by MIN_NODE_ARC_LENGTH along the arc too — the formula scales with count, not a fixed cap", () => {
    const radius = radiusForDepth(2, 47);
    const arcSpacing = (2 * Math.PI * radius) / 47;

    expect(arcSpacing).toBeGreaterThanOrEqual(MIN_NODE_ARC_LENGTH);
  });

  it("never pulls a sparse deep ring inward past the fixed per-depth minimum, keeping depth visually legible", () => {
    const radius = radiusForDepth(3, 2);

    expect(radius).toBe(MIN_RADIAL_STEP * 3);
  });
});

describe("positionRadial", () => {
  it("places the root at the shared center", () => {
    const fixture = taxonomyShapedFixture({
      topLevelCount: 3,
      childrenPerTopLevel: 2,
      grandchildrenPerChild: 1,
    });
    const root = hierarchy<FixtureNode>(fixture, (d) => (d.children.length > 0 ? d.children : undefined));

    const positioned = positionRadial(root);

    expect(positioned.x).toBe(0);
    expect(positioned.y).toBe(0);
  });

  it("keeps every rendered node's center at least MIN_NODE_SEPARATION_PX away from every other, against the real taxonomy's actual branching shape", () => {
    const fixture = taxonomyShapedFixture({
      topLevelCount: REAL_TAXONOMY_TOP_LEVEL_DOMAIN_COUNT,
      childrenPerTopLevel: 4,
      grandchildrenPerChild: 3,
    });
    const root = hierarchy<FixtureNode>(fixture, (d) => (d.children.length > 0 ? d.children : undefined));

    const positioned = positionRadial(root);
    const renderedNodes = positioned.descendants().filter((d) => d.depth > 0);

    let minObservedDistance = Infinity;

    for (const [i, nodeA] of renderedNodes.entries()) {
      for (const nodeB of renderedNodes.slice(i + 1)) {
        minObservedDistance = Math.min(minObservedDistance, distance(nodeA, nodeB));
      }
    }

    expect(minObservedDistance).toBeGreaterThanOrEqual(MIN_NODE_SEPARATION_PX);
  });

  it("is a pure function: the same input tree produces byte-identical positions on every call", () => {
    const fixtureA = taxonomyShapedFixture({
      topLevelCount: 5,
      childrenPerTopLevel: 3,
      grandchildrenPerChild: 2,
    });
    const fixtureB = taxonomyShapedFixture({
      topLevelCount: 5,
      childrenPerTopLevel: 3,
      grandchildrenPerChild: 2,
    });

    const positionedA = positionRadial(
      hierarchy<FixtureNode>(fixtureA, (d) => (d.children.length > 0 ? d.children : undefined)),
    ).descendants().map((d) => ({ id: d.data.id, x: d.x, y: d.y }));
    const positionedB = positionRadial(
      hierarchy<FixtureNode>(fixtureB, (d) => (d.children.length > 0 ? d.children : undefined)),
    ).descendants().map((d) => ({ id: d.data.id, x: d.x, y: d.y }));

    expect(positionedA).toEqual(positionedB);
  });
});
