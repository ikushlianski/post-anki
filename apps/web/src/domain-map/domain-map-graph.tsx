import { useCallback, useMemo, useState } from 'react'
import { ReactFlow, type EdgeTypes, type NodeTypes } from '@xyflow/react'
import type { DomainNodeTreeItem } from '@post-anki/shared'
import { computeDomainMapLayout, defaultCollapsedNodeIds } from '@post-anki/core'

import { DomainMapGraphNode, type DomainMapGraphNodeType } from './domain-map-graph-node'
import { DomainMapGraphEdge, type DomainMapGraphEdgeType } from './domain-map-graph-edge'
import { DomainMapGraphDetailPanel } from './domain-map-graph-detail-panel'

// visual-knowledge-map (issue #86), SCENARIO 1/3/4/8/9 — `nodeTypes` and
// `edgeTypes` MUST be stable module-level constants, never inline object
// literals in the component body: React Flow remounts every custom node/edge
// on every render otherwise, which would fire on every collapse/expand click
// and every detail-panel open (this ticket's own red-team-flagged fix).
const nodeTypes: NodeTypes = { domainMapNode: DomainMapGraphNode }
const edgeTypes: EdgeTypes = { domainMapEdge: DomainMapGraphEdge }

// The graph canvas's own container sizing (SCENARIO 8): full width of
// whatever the route hands it, and a fixed height so the canvas doesn't
// fight page scroll. `min-h-11 min-w-11` on the node's own click targets
// (domain-map-graph-node.tsx) is the other half of the 44x44px touch-target
// requirement.
const CANVAS_CLASSES = 'h-[480px] w-full sm:h-[600px]'

export function DomainMapGraph({
  nodes,
  onManageInListView,
}: {
  nodes: DomainNodeTreeItem[]
  onManageInListView: () => void
}) {
  // Lazy initializer only runs once per mount — since this component only
  // mounts while the Map toggle is selected, the depth-bounded default
  // (SCENARIO 9) naturally resets every time Map is (re)selected, never
  // persisted (SCENARIO 4's own requirement).
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(() =>
    defaultCollapsedNodeIds(nodes),
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const layout = useMemo(
    () => computeDomainMapLayout(nodes, collapsedNodeIds),
    [nodes, collapsedNodeIds],
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

  const flowEdges: DomainMapGraphEdgeType[] = useMemo(
    () =>
      layout.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'domainMapEdge',
        data: { highlighted: edge.highlighted },
      })),
    [layout.edges],
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
