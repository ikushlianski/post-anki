import { tree, type HierarchyNode, type HierarchyPointNode } from "d3-hierarchy";

// #86 widened (mind-map/tree-hierarchy dual view) — the radial positioning
// math for Mind-map mode. Split out of domain-map-layout.ts to keep that
// file under this repo's ~150-300 line file-size convention, mirroring the
// same split domain-map-graph-edge.tsx already used in this feature area
// (build-log.md, original #86 pass). Pure, no DOM/React/network dependency —
// same class of function as computeDomainMapLayout and domainNodeProgress
// elsewhere in this package.

// Same order of magnitude as domain-map-layout.ts's own NODE_SPACING_Y (140)
// for the tree layout's fixed per-depth increment — a radial layout needs a
// slightly larger step since a full ring's circumference (not just row
// height) has to fit every node sharing that depth.
export const MIN_RADIAL_STEP = 260;

// Matches domain-map-graph-node.tsx's `w-48` card width.
export const NODE_CARD_WIDTH = 192;

// Breathing room between adjacent cards sharing a ring.
export const MIN_NODE_GAP = 24;

export const MIN_NODE_ARC_LENGTH = NODE_CARD_WIDTH + MIN_NODE_GAP;

// Two node centers anywhere in a rendered mind-map — whether they share a
// ring or sit at different depths — should never end up closer than this.
// Intentionally smaller than MIN_NODE_ARC_LENGTH: straight-line (chord)
// distance between two adjacent points on the same ring is always <= the
// arc distance between them, so bounding by arc length alone would be a
// slightly optimistic promise about actual on-screen separation.
export const MIN_NODE_SEPARATION_PX = NODE_CARD_WIDTH;

// A ring's radius is the LARGER of a fixed minimum step (keeps narrow deep
// branches from being needlessly spread out) and whatever radius makes its
// own node count fit around the circle without cards touching. Root is
// always radius 0 (rendered at the shared center) — depth here is
// d3-hierarchy's own raw depth (0 = the synthetic sentinel root that anchors
// the whole forest at the center; 1 = the real top-level domains' ring; and
// so on), not the display-adjusted `depth` field on DomainMapLayoutNode.
export function radiusForDepth(depth: number, nodeCountAtDepth: number): number {
  if (depth === 0) {
    return 0;
  }

  const crowdingRadius = (nodeCountAtDepth * MIN_NODE_ARC_LENGTH) / (2 * Math.PI);

  return Math.max(MIN_RADIAL_STEP * depth, crowdingRadius);
}

// Angle allocation reuses d3-hierarchy's own leaf-count-proportional `x`
// output (the same tree() primitive domain-map-layout.ts's positionTree
// already uses), configured with `.size([2 * Math.PI, 1])` so `x` yields an
// angle in [0, 2*Math.PI) and `y` stays a throwaway placeholder. The real
// radius is hand-computed per node via radiusForDepth, keyed off how many
// other nodes share that exact depth across the WHOLE tree — a ring's
// radius is shared by every node at that depth, not just one parent's own
// children, since a radial layout's ring circumference is a global resource.
//
// `.separation` is pinned to a flat `1` for every pair, overriding
// d3-hierarchy's own default (which divides by node depth, packing deeper
// nodes' raw angular slots closer together than shallower ones). Left at
// the default, that depth-weighting silently broke radiusForDepth's own
// promise: two deep siblings could land under MIN_NODE_ARC_LENGTH apart
// even though their ring's radius was sized for evenly-spaced siblings
// (caught by AC 10's real-taxonomy-shaped no-overlap test, not assumed).
export function positionRadial<T>(root: HierarchyNode<T>): HierarchyPointNode<T> {
  const angled = tree<T>()
    .size([2 * Math.PI, 1])
    .separation(() => 1)(root);
  const descendants = angled.descendants();

  const nodeCountByDepth = new Map<number, number>();

  for (const descendant of descendants) {
    nodeCountByDepth.set(descendant.depth, (nodeCountByDepth.get(descendant.depth) ?? 0) + 1);
  }

  for (const descendant of descendants) {
    const radius = radiusForDepth(descendant.depth, nodeCountByDepth.get(descendant.depth) ?? 1);
    const angle = descendant.x - Math.PI / 2;

    descendant.x = radius * Math.cos(angle);
    descendant.y = radius * Math.sin(angle);
  }

  return angled;
}
