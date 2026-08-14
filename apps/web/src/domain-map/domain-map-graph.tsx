import { useCallback, useMemo, useState } from 'react'
import { ReactFlow, type EdgeTypes, type NodeTypes } from '@xyflow/react'
import type { DomainNodeTreeItem } from '@post-anki/shared'
import { computeDomainMapLayout, defaultCollapsedNodeIds, type DomainMapLayoutMode } from '@post-anki/core'

import { DomainMapGraphNode, type DomainMapGraphNodeType } from './domain-map-graph-node'
import { DomainMapGraphEdge, type DomainMapGraphEdgeType } from './domain-map-graph-edge'
import {
  DomainMapGraphRadialEdge,
  type DomainMapGraphRadialEdgeType,
} from './domain-map-graph-radial-edge'
import { DomainMapGraphDetailPanel } from './domain-map-graph-detail-panel'

// visual-knowledge-map (issue #86), SCENARIO 1/3/4/8/9 — `nodeTypes` and
// `edgeTypes` MUST be stable module-level constants, never inline object
// literals in the component body: React Flow remounts every custom node/edge
// on every render otherwise, which would fire on every collapse/expand click
// and every detail-panel open (this ticket's own red-team-flagged fix).
//
// #86 widened (mind-map/tree-hierarchy dual view), SCENARIO 8 — edgeTypes
// widens to carry both edge components, registered once regardless of which
// mode is active; which one actually renders for a given edge is decided by
// that edge's own `type` field (set per-mode in flowEdges below), never by
// conditionally constructing this object. nodeTypes stays untouched — the
// same node component renders both modes.
// Exported (not just module-scoped) so domain-map-graph.test.tsx can assert
// directly on this object's shape/identity (AC 17) without relying on a
// rendered-DOM proxy for something React Flow itself doesn't expose in the
// DOM until nodes are measured.
export const nodeTypes: NodeTypes = { domainMapNode: DomainMapGraphNode }
export const edgeTypes: EdgeTypes = {
  domainMapEdge: DomainMapGraphEdge,
  domainMapRadialEdge: DomainMapGraphRadialEdge,
}

// The graph canvas's own container sizing (SCENARIO 8): full width of
// whatever the route hands it, and a fixed height so the canvas doesn't
// fight page scroll. `min-h-11 min-w-11` on the node's own click targets
// (domain-map-graph-node.tsx) is the other half of the 44x44px touch-target
// requirement.
const CANVAS_CLASSES = 'h-[480px] w-full sm:h-[600px]'

// #86 widened (mind-map/tree-hierarchy dual view) — React Flow's own
// default minZoom (0.5) was sized for tree mode's much more compact
// orthogonal spread. Mind-map mode's crowding-aware radius (Decision 3)
// deliberately sizes each ring off its OWN real node count shared across
// the whole tree, not one parent's own children — for the real 208-node/
// 15-domain taxonomy that puts depth-2 (~70 nodes sharing one ring) at a
// radius roughly 4-5x depth-1's, so the full mind-map's bounding box is far
// wider than tree mode's ever gets. Left at the 0.5 default, `fitView`
// cannot zoom out past that floor and silently clips outer rings out of
// view — caught by this ticket's own live-browser runtime-proof gate
// against the real seeded taxonomy, not assumed from the synthetic test
// fixtures. Lowering the floor only widens how far OUT fitView is allowed
// to go if the content needs it; tree mode's own already-compact fit is
// unaffected (fitView still only zooms out as far as the content requires).
const MIN_ZOOM = 0.05

export function DomainMapGraph({
  nodes,
  mode,
  onManageInListView,
}: {
  nodes: DomainNodeTreeItem[]
  mode: DomainMapLayoutMode
  onManageInListView: () => void
}) {
  // Lazy initializer only runs once per mount — since this component only
  // mounts while a graphical toggle state is selected, and the route keys
  // this component by `mode` (#86 widened, Decision 8), the depth-bounded
  // default (SCENARIO 9) naturally resets every time a graphical tab is
  // (re)selected OR switched between Tree/Mind-map, never persisted
  // (SCENARIO 4/21's own requirement).
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() =>
    defaultCollapsedNodeIds(nodes),
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const layout = useMemo(
    () => computeDomainMapLayout(nodes, collapsedNodeIds, mode),
    [nodes, collapsedNodeIds, mode],
  )

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedNodeIds((previous) => {
      const next = new Set(previous)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }, [])

  const handleOpenDetails = useCallback((id: string) => {
    setSelectedNodeId(id)
  }, [])

  const flowNodes: DomainMapGraphNodeType[] = useMemo(
    () =>
      layout.nodes.map((layoutNode) => ({
        id: layoutNode.id,
        type: 'domainMapNode',
        position: { x: layoutNode.x, y: layoutNode.y },
        data: {
          layoutNode,
          collapsed: collapsedNodeIds.has(layoutNode.id),
          onToggleCollapse: handleToggleCollapse,
          onOpenDetails: handleOpenDetails,
        },
      })),
    [layout.nodes, collapsedNodeIds, handleToggleCollapse, handleOpenDetails],
  )

  const flowEdges: (DomainMapGraphEdgeType | DomainMapGraphRadialEdgeType)[] = useMemo(
    () =>
      layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: mode === 'mindmap' ? 'domainMapRadialEdge' : 'domainMapEdge',
        data: { highlighted: edge.highlighted },
      })),
    [layout.edges, mode],
  )

  const selectedNode = selectedNodeId
    ? (layout.nodes.find((layoutNode) => layoutNode.id === selectedNodeId)?.node ?? null)
    : null

  return (
    <div>
      <div data-testid="domain-map-graph" className={CANVAS_CLASSES}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={MIN_ZOOM}
          proOptions={{ hideAttribution: true }}
        />
      </div>

      {selectedNode ? (
        <DomainMapGraphDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNodeId(null)}
          onManageInListView={() => {
            setSelectedNodeId(null)
            onManageInListView()
          }}
        />
      ) : null}
    </div>
  )
}
