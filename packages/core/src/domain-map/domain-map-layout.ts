import { hierarchy, tree } from "d3-hierarchy";
import type { DomainNodeTreeItem } from "@post-anki/shared";

// visual-knowledge-map (issue #86) — the graph view's own pure layout
// deriver. Takes the same DomainNodeTreeItem[] tree the existing text-tree
// view already renders (unchanged shape, unchanged endpoint) plus which node
// ids are currently collapsed, and returns positioned nodes/edges for
// @xyflow/react to render. No DOM, no React, no network call — same class of
// function as domainNodeProgress/isAncestor in this same package.

export interface DomainMapLayoutNode {
  id: string;
  x: number;
  y: number;
  depth: number;
  hasChildren: boolean;
  childCount: number;
  node: DomainNodeTreeItem;
}

export interface DomainMapLayoutEdge {
  id: string;
  source: string;
  target: string;
  highlighted: boolean;
}

export interface DomainMapLayout {
  nodes: DomainMapLayoutNode[];
  edges: DomainMapLayoutEdge[];
}

// Defensive bound only, same posture as domainNodeProgress's own MAX_DEPTH
// (domain-map-progress.ts) — no real taxonomy is expected to approach this;
// it exists purely so a malformed or cyclic input can't recurse forever, not
// because any real domain tree is expected to be this deep. Kept larger than
// domainNodeProgress's MAX_DEPTH (6) since that cap bounds a rollup where
// under-counting is low-stakes, while this bounds the actual rendered
// structure.
const MAX_DEPTH = 50;

const NODE_SPACING_X = 220;
const NODE_SPACING_Y = 140;

const ROOT_SENTINEL_ID = "__domain-map-layout-root__";

interface TraversalNode {
  id: string;
  data: DomainNodeTreeItem | null;
  children: TraversalNode[];
}

// Computed once, over the FULL original tree (not the collapse-filtered
// one) — a node's edge-to-parent is highlighted iff that node OR any of its
// descendants has curricula.length > 0, regardless of whether those
// descendants are currently hidden by a collapse (SCENARIO 3). Cycle-safe
// via a single visited set shared across the whole traversal, mirroring
// domainNodeProgress's own guard style.
function computeHighlightMap(roots: DomainNodeTreeItem[]): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const visited = new Set<string>();

  function visit(node: DomainNodeTreeItem, depth: number): boolean {
    if (depth > MAX_DEPTH || visited.has(node.id)) {
      return false;
    }

    visited.add(node.id);

    let hasCurricula = node.curricula.length > 0;

    for (const child of node.children) {
      const childHasCurricula = visit(child, depth + 1);

      hasCurricula = hasCurricula || childHasCurricula;
    }

    result.set(node.id, hasCurricula);

    return hasCurricula;
  }

  for (const root of roots) {
    visit(root, 0);
  }

  return result;
}

// Builds the collapse-filtered tree that actually gets positioned/rendered.
// A collapsed node's own entry is still built (it stays visible) but its
// children are pruned from the traversal entirely, so their whole subtree
// never reaches computeDomainMapLayout's output (SCENARIO 7). Wrapped under
// a synthetic sentinel root so d3-hierarchy's tree() has a single root to
// lay out even though the real data is a forest of top-level domain nodes.
function buildVisibleTree(
  roots: DomainNodeTreeItem[],
  collapsedNodeIds: ReadonlySet<string>,
): TraversalNode {
  const visited = new Set<string>();

  function build(node: DomainNodeTreeItem, depth: number): TraversalNode {
    visited.add(node.id);

    const collapsed = collapsedNodeIds.has(node.id);
    const children: TraversalNode[] =
      collapsed || depth >= MAX_DEPTH
        ? []
        : node.children
            .filter((child) => !visited.has(child.id))
            .map((child) => build(child, depth + 1));

    return { id: node.id, data: node, children };
  }

  return {
    id: ROOT_SENTINEL_ID,
    data: null,
    children: roots.map((root) => build(root, 0)),
  };
}

export function computeDomainMapLayout(
  nodes: DomainNodeTreeItem[],
  collapsedNodeIds: ReadonlySet<string>,
): DomainMapLayout {
  const highlightMap = computeHighlightMap(nodes);
  const visibleRoot = buildVisibleTree(nodes, collapsedNodeIds);

  const root = hierarchy<TraversalNode>(visibleRoot, (d) =>
    d.children.length > 0 ? d.children : undefined,
  );

  const positionedRoot = tree<TraversalNode>().nodeSize([NODE_SPACING_X, NODE_SPACING_Y])(root);

  const layoutNodes: DomainMapLayoutNode[] = [];
  const edges: DomainMapLayoutEdge[] = [];

  for (const descendant of positionedRoot.descendants()) {
    const domainNode = descendant.data.data;

    if (domainNode === null) {
      continue;
    }

    layoutNodes.push({
      id: domainNode.id,
      x: descendant.x,
      y: descendant.y,
      depth: descendant.depth - 1,
      hasChildren: domainNode.children.length > 0,
      childCount: domainNode.children.length,
      node: domainNode,
    });

    const parentDomainNode = descendant.parent?.data.data ?? null;

    if (descendant.parent && parentDomainNode !== null) {
      edges.push({
        id: `${parentDomainNode.id}-${domainNode.id}`,
        source: parentDomainNode.id,
        target: domainNode.id,
        highlighted: highlightMap.get(domainNode.id) ?? false,
      });
    }
  }

  return { nodes: layoutNodes, edges };
}

// The graph view's initial collapse state (SCENARIO 9): every node at depth
// >= 1 starts collapsed, so first render is bounded to the depth-0/1 node
// count rather than the full taxonomy size. This only stays small if
// depth-0/1 themselves stay narrow (this ticket's ~15-20 top-level-domain
// design assumption) — a shallow-but-wide taxonomy would still render all of
// its depth-0/1 nodes on first paint; this is a stated, accepted limitation,
// not a claim that depth-bounding solves rendering cost for every possible
// taxonomy shape (scenarios.md, SCENARIO 9).
//
// Deliberately depth >= 1, not depth >= 2 as spec.md's Derivers table
// literally says: computeDomainMapLayout's own documented contract is that a
// collapsed id excludes that node's DESCENDANTS, never the node itself
// (spec.md line 30, SCENARIO 7, and SCENARIO 4's chevron/count indicator,
// which is rendered ON the collapsed node — it couldn't be if the node
// itself were hidden). Under that contract, collapsing depth-2 ids only
// hides depth-3+; it can never bound first render to "depth-0/1 only," which
// is SCENARIO 9's own literal, tested requirement. Collapsing every depth
// >= 1 id (not just depth 1) also makes the one-level-at-a-time reveal fall
// out for free: when a depth-1 node is expanded, its newly-visible depth-2
// children are already carrying their own default-collapsed flag, so their
// depth-3 children don't cascade into view in the same click.
export function defaultCollapsedNodeIds(nodes: DomainNodeTreeItem[]): Set<string> {
  const result = new Set<string>();
  const visited = new Set<string>();

  function visit(node: DomainNodeTreeItem, depth: number): void {
    if (depth > MAX_DEPTH || visited.has(node.id)) {
      return;
    }

    visited.add(node.id);

    if (depth >= 1) {
      result.add(node.id);
    }

    for (const child of node.children) {
      visit(child, depth + 1);
    }
  }

  for (const root of nodes) {
    visit(root, 0);
  }

  return result;
}
