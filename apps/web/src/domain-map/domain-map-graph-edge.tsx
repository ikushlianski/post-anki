import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'

// visual-knowledge-map (issue #86), SCENARIO 3 — curricula-covered paths
// render with a distinct edge style. Split into its own file (rather than
// inlined in domain-map-graph.tsx) to keep that file's line count down per
// this repo's file-size convention; still registered as a stable
// module-level `edgeTypes` entry by domain-map-graph.tsx, never an inline
// object literal (the React Flow remount gotcha this ticket's red-team pass
// flagged for both nodeTypes and edgeTypes).
export interface DomainMapGraphEdgeData extends Record<string, unknown> {
  highlighted: boolean
}

export type DomainMapGraphEdgeType = Edge<DomainMapGraphEdgeData, 'domainMapEdge'>

export function DomainMapGraphEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<DomainMapGraphEdgeType>) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const highlighted = data?.highlighted ?? false

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke: highlighted ? '#16a34a' : '#d4d4d4',
        strokeWidth: highlighted ? 2.5 : 1.5,
      }}
    />
  )
}
