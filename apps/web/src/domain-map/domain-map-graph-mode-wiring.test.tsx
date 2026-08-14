// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

// #86 widened (mind-map/tree-hierarchy dual view), SCENARIO 8, AC 17/18 —
// what actually gets handed to React Flow (edgeTypes identity, each edge's
// per-mode `type` tag) isn't observable through a rendered DOM assertion:
// React Flow only paints edges once their source/target nodes report
// measured dimensions, which jsdom's ResizeObserver stub never triggers
// (verified directly — domain-map-graph.test.tsx's own comment). Mocking
// React Flow's own component to capture its props is the only way to assert
// this wiring without touching production code just to make it testable.
const capturedState: { props: Record<string, unknown> | null } = { props: null }

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>()

  return {
    ...actual,
    ReactFlow: (props: Record<string, unknown>) => {
      capturedState.props = props

      return null
    },
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

afterEach(() => {
  cleanup()
  capturedState.props = null
})

function getCapturedReactFlowProps(): Record<string, unknown> {
  if (!capturedState.props) {
    throw new Error('React Flow was never rendered')
  }

  return capturedState.props
}

function makeNode(overrides: Partial<DomainNodeTreeItem> & { id: string }): DomainNodeTreeItem {
  return {
    subjectId: 'sub-1',
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
    source: 'ai_generated',
    kind: null,
    ...overrides,
  }
}

function threeLevelTree(): DomainNodeTreeItem[] {
  const grandchild = makeNode({ id: 'grandchild-1', parentId: 'child-1' })
  const child1 = makeNode({ id: 'child-1', parentId: 'root-1', children: [grandchild] })
  const child2 = makeNode({ id: 'child-2', parentId: 'root-1' })
  const root = makeNode({ id: 'root-1', children: [child1, child2] })

  return [root]
}

describe('DomainMapGraph mode wiring into React Flow', () => {
  it('passes the identical frozen edgeTypes/nodeTypes object into React Flow in both modes, never a mode-conditional rebuild (AC 17)', async () => {
    const { DomainMapGraph, edgeTypes, nodeTypes } = await import('./domain-map-graph')

    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)
    const treeEdgeTypes = getCapturedReactFlowProps().edgeTypes
    const treeNodeTypes = getCapturedReactFlowProps().nodeTypes

    cleanup()
    capturedState.props = null

    render(<DomainMapGraph nodes={threeLevelTree()} mode="mindmap" onManageInListView={vi.fn()} />)
    const mindmapEdgeTypes = getCapturedReactFlowProps().edgeTypes
    const mindmapNodeTypes = getCapturedReactFlowProps().nodeTypes

    expect(treeEdgeTypes).toBe(edgeTypes)
    expect(mindmapEdgeTypes).toBe(edgeTypes)
    expect(treeNodeTypes).toBe(nodeTypes)
    expect(mindmapNodeTypes).toBe(nodeTypes)
    expect(Object.keys(edgeTypes)).toEqual(['domainMapEdge', 'domainMapRadialEdge'])
  })

  it('tags every edge "domainMapEdge" in tree mode and "domainMapRadialEdge" in mind-map mode (AC 18)', async () => {
    const { DomainMapGraph } = await import('./domain-map-graph')

    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)
    const treeEdges = getCapturedReactFlowProps().edges as Array<{ type: string }>

    cleanup()
    capturedState.props = null

    render(<DomainMapGraph nodes={threeLevelTree()} mode="mindmap" onManageInListView={vi.fn()} />)
    const mindmapEdges = getCapturedReactFlowProps().edges as Array<{ type: string }>

    expect(treeEdges.length).toBeGreaterThan(0)
    expect(treeEdges.every((edge) => edge.type === 'domainMapEdge')).toBe(true)

    expect(mindmapEdges.length).toBeGreaterThan(0)
    expect(mindmapEdges.every((edge) => edge.type === 'domainMapRadialEdge')).toBe(true)
  })
})
