// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Position } from '@xyflow/react'

import { DomainMapGraphRadialEdge } from './domain-map-graph-radial-edge'

// #86 widened (mind-map/tree-hierarchy dual view), SCENARIO 7 — this edge
// must route from the layout's real coordinates, not assume the child sits
// below its parent (the tree-mode bezier edge's own assumption). A child
// positioned off-axis (to the parent's right, not below it) is the case a
// Handle-Position-driven bezier would get visibly wrong.
afterEach(() => {
  cleanup()
})

function renderEdge(props: Partial<Parameters<typeof DomainMapGraphRadialEdge>[0]> = {}) {
  return render(
    <svg>
      <DomainMapGraphRadialEdge
        id="parent-child"
        source="parent"
        target="child"
        sourceX={0}
        sourceY={0}
        targetX={150}
        targetY={-40}
        sourcePosition={Position.Bottom}
        targetPosition={Position.Top}
        data={{ highlighted: false }}
        {...props}
      />
    </svg>,
  )
}

describe('DomainMapGraphRadialEdge', () => {
  it('draws a straight line to the edge’s real endpoint coordinates for a child positioned beside its parent, not below it', () => {
    const { container } = renderEdge({ sourceX: 0, sourceY: 0, targetX: 150, targetY: -40 })

    const path = container.querySelector('path.react-flow__edge-path')

    expect(path?.getAttribute('d')).toBe('M 0,0L 150,-40')
  })

  it('renders the green highlighted stroke for a curricula-covered path', () => {
    const { container } = renderEdge({ data: { highlighted: true } })

    const path = container.querySelector('path.react-flow__edge-path')

    expect(path?.getAttribute('style')).toContain('stroke: rgb(22, 163, 74)')
    expect(path?.getAttribute('style')).toContain('stroke-width: 2.5')
  })

  it('renders the grey unhighlighted stroke for an uncovered path', () => {
    const { container } = renderEdge({ data: { highlighted: false } })

    const path = container.querySelector('path.react-flow__edge-path')

    expect(path?.getAttribute('style')).toContain('stroke: rgb(212, 212, 212)')
    expect(path?.getAttribute('style')).toContain('stroke-width: 1.5')
  })
})
