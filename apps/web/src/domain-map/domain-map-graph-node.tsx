import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { DomainMapLayoutNode } from '@post-anki/core'
import { domainMasteryStatus, domainPriorityDistance } from '@post-anki/core'

import { domainMasteryColor } from './domain-mastery-color'

// visual-knowledge-map (issue #86), SCENARIO 2, 4, 5, 8 — the custom React
// Flow node: mastery color, gap/superseded/priority-distance badges (same
// semantics as domain-map-tree.tsx's existing list view), a collapse-toggle
// click target, and a separate details click target. `data-testid`s and
// `min-h-11 min-w-11` (= 44x44px) touch-target sizing are pinned exactly as
// named in this ticket's red-team-flagged fixes — no inventing alternates.
export interface DomainMapGraphNodeData extends Record<string, unknown> {
  layoutNode: DomainMapLayoutNode
  collapsed: boolean
  onToggleCollapse: (id: string) => void
  onOpenDetails: (id: string) => void
}

export type DomainMapGraphNodeType = Node<DomainMapGraphNodeData, 'domainMapNode'>

export function DomainMapGraphNode({ data }: NodeProps<DomainMapGraphNodeType>) {
  const { layoutNode, collapsed, onToggleCollapse, onOpenDetails } = data
  const { node } = layoutNode
  const status = domainMasteryStatus(node.percent)
  const colorClass = domainMasteryColor(status, node.percent)
  const priorityDistance = domainPriorityDistance(node.targetDepth, node.percent)

  return (
    <div
      className={`w-48 rounded-lg border px-3 py-2 text-xs shadow-sm ${colorClass}`}
      data-testid={`domain-map-graph-node-container-${layoutNode.id}`}
    >
      <Handle type="target" position={Position.Top} />

      <button
        type="button"
        data-testid={`domain-map-graph-node-${layoutNode.id}`}
        onClick={() => {
          if (layoutNode.hasChildren) {
            onToggleCollapse(layoutNode.id)
          }
        }}
        className="flex min-h-11 min-w-11 w-full flex-col items-start justify-center gap-0.5 text-left"
      >
        <span className="font-medium">{node.name}</span>
        <span title="exact mastery percent">{node.percent}%</span>

        {layoutNode.hasChildren ? (
          <span
            data-testid={`domain-map-graph-node-child-count-${layoutNode.id}`}
            className="text-[11px] opacity-80"
          >
            {collapsed ? `▶ ${layoutNode.childCount} hidden` : '▼ expanded'}
          </span>
        ) : null}

        <div className="flex flex-wrap gap-1">
          {status === 'gap' ? (
            <span
              data-testid={`domain-map-graph-node-gap-badge-${layoutNode.id}`}
              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700"
            >
              0% — gap
            </span>
          ) : null}
          {node.supersededAt ? (
            <span
              data-testid={`domain-map-graph-node-superseded-badge-${layoutNode.id}`}
              title={node.supersededReason ?? undefined}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
            >
              possibly outdated
            </span>
          ) : null}
          {priorityDistance !== null ? (
            <span
              data-testid={`domain-map-graph-node-priority-distance-${layoutNode.id}`}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
            >
              {priorityDistance} to target
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        data-testid={`domain-map-graph-node-details-${layoutNode.id}`}
        onClick={() => onOpenDetails(layoutNode.id)}
        className="mt-1 min-h-11 min-w-11 text-[11px] underline"
      >
        Details
      </button>

      <Handle type="source" position={Position.Bottom} />
    </div>
  )
}
