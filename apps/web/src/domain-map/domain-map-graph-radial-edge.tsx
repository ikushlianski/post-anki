import { BaseEdge, getStraightPath, type Edge, type EdgeProps } from '@xyflow/react'

import type { DomainMapGraphEdgeData } from './domain-map-graph-edge'

// #86 widened (mind-map/tree-hierarchy dual view) — Mind-map mode's edge.
// The existing DomainMapGraphEdge draws a bezier shaped for vertical
// top-to-bottom flow (fixed Position.Top/Position.Bottom Handles on every
// node); reused unmodified in a radial layout it would draw every off-axis
// child's edge as if it sat directly below its parent, which is almost every
// edge in a radial layout. getStraightPath instead draws a direct line
// between the edge's own real sourceX/Y-targetX/Y coordinates, independent
// of either node's fixed Handle position. Same highlighted:boolean data
// shape and stroke styling as DomainMapGraphEdge — only the path-computation
// function differs.
export type DomainMapGraphRadialEdgeType = Edge<DomainMapGraphEdgeData, 'domainMapRadialEdge'>

export function DomainMapGraphRadialEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<DomainMapGraphRadialEdgeType>) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })

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
