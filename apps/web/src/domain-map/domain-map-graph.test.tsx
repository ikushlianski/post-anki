// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { DomainMapGraph } from './domain-map-graph'

// visual-knowledge-map (issue #86), SCENARIO 1/4/5/8/9 — DomainMapGraphDetailPanel
// renders a real router Link, so this needs the same '@tanstack/react-router'
// stub domain-map-tree.test.tsx already established for this domain.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

afterEach(() => {
  cleanup()
})

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
  const grandchild = makeNode({ id: 'grandchild-1', parentId: 'child-1', percent: 40 })
  const child1 = makeNode({ id: 'child-1', parentId: 'root-1', children: [grandchild], percent: 10 })
  const child2 = makeNode({ id: 'child-2', parentId: 'root-1', percent: 0 })
  const root = makeNode({ id: 'root-1', children: [child1, child2] })

  return [root]
}

describe('DomainMapGraph', () => {
  it('renders only depth-0/1 nodes on initial mount, not depth-2 descendants (SCENARIO 9)', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    expect(screen.getByTestId('domain-map-graph-node-root-1')).toBeTruthy()
    expect(screen.getByTestId('domain-map-graph-node-child-1')).toBeTruthy()
    expect(screen.getByTestId('domain-map-graph-node-child-2')).toBeTruthy()
    expect(screen.queryByTestId('domain-map-graph-node-grandchild-1')).toBeNull()
  })

  it('reveals a node’s direct children when its collapse toggle is clicked, and hides them again on a second click', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    expect(screen.queryByTestId('domain-map-graph-node-grandchild-1')).toBeNull()

    fireEvent.click(screen.getByTestId('domain-map-graph-node-child-1'))
    expect(screen.getByTestId('domain-map-graph-node-grandchild-1')).toBeTruthy()

    fireEvent.click(screen.getByTestId('domain-map-graph-node-child-1'))
    expect(screen.queryByTestId('domain-map-graph-node-grandchild-1')).toBeNull()
  })

  it('does nothing when a leaf node’s body is clicked', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    expect(() => fireEvent.click(screen.getByTestId('domain-map-graph-node-child-2'))).not.toThrow()
    expect(screen.queryByTestId('domain-map-graph-detail-panel')).toBeNull()
  })

  it('opens the read-only detail panel when a node’s details target is clicked, without altering collapse state', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    expect(screen.queryByTestId('domain-map-graph-detail-panel')).toBeNull()

    fireEvent.click(screen.getByTestId('domain-map-graph-node-details-root-1'))

    const panel = screen.getByTestId('domain-map-graph-detail-panel')

    expect(within(panel).getByText('root-1')).toBeTruthy()
    expect(screen.queryByTestId('domain-map-graph-node-grandchild-1')).toBeNull()
  })

  it('calls onManageInListView when the detail panel’s escape hatch is clicked', () => {
    const onManageInListView = vi.fn()

    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={onManageInListView} />)
    fireEvent.click(screen.getByTestId('domain-map-graph-node-details-root-1'))
    fireEvent.click(screen.getByTestId('domain-map-graph-detail-panel-manage-in-list'))

    expect(onManageInListView).toHaveBeenCalledOnce()
  })

  it('renders the canvas full-width with a fixed height, per this route’s mobile-responsive requirement (SCENARIO 8)', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    const canvas = screen.getByTestId('domain-map-graph')

    expect(canvas.className).toContain('w-full')
    expect(canvas.className).toContain('h-[480px]')
  })

  it('gives both of a node’s click targets the 44x44px minimum touch-target classes', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="tree" onManageInListView={vi.fn()} />)

    const body = screen.getByTestId('domain-map-graph-node-root-1')
    const details = screen.getByTestId('domain-map-graph-node-details-root-1')

    expect(body.className).toContain('min-h-11')
    expect(body.className).toContain('min-w-11')
    expect(details.className).toContain('min-h-11')
    expect(details.className).toContain('min-w-11')
  })
})

// #86 widened (mind-map/tree-hierarchy dual view) — mode='mindmap' render
// path, alongside the existing mode='tree' cases above.
describe('DomainMapGraph in mind-map mode', () => {
  it('renders the same shared node component for the same nodes as tree mode (SCENARIO 2)', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="mindmap" onManageInListView={vi.fn()} />)

    expect(screen.getByTestId('domain-map-graph-node-root-1')).toBeTruthy()
    expect(screen.getByTestId('domain-map-graph-node-child-1')).toBeTruthy()
    expect(screen.getByTestId('domain-map-graph-node-child-2')).toBeTruthy()
    expect(screen.queryByTestId('domain-map-graph-node-grandchild-1')).toBeNull()
  })

  it('still opens the detail panel and honors collapse/expand identically to tree mode', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="mindmap" onManageInListView={vi.fn()} />)

    fireEvent.click(screen.getByTestId('domain-map-graph-node-child-1'))
    expect(screen.getByTestId('domain-map-graph-node-grandchild-1')).toBeTruthy()

    fireEvent.click(screen.getByTestId('domain-map-graph-node-details-root-1'))
    const panel = screen.getByTestId('domain-map-graph-detail-panel')

    expect(within(panel).getByText('root-1')).toBeTruthy()
  })

  // AC 17's edgeTypes-identity-across-modes claim and AC 18's per-edge
  // `type` tagging are asserted in domain-map-graph-mode-wiring.test.tsx via
  // a mocked React Flow, not here: React Flow only paints an edge once its
  // source/target nodes report measured dimensions, which never happens
  // under jsdom's ResizeObserver stub (the pre-existing
  // `<div class="react-flow__edges">` stays empty regardless of mode —
  // verified directly, not assumed), so a rendered-DOM assertion in THIS
  // file can't see edges at all, let alone their type. This test instead
  // covers the DOM-observable half of AC 17: an interaction that changes
  // one node's collapse state doesn't remount an unrelated node.
  it('does not remount an unrelated node when a different node’s collapse state changes (AC 17, doubled edgeTypes/nodeTypes registration stays remount-safe)', () => {
    render(<DomainMapGraph nodes={threeLevelTree()} mode="mindmap" onManageInListView={vi.fn()} />)

    const rootNodeBefore = screen.getByTestId('domain-map-graph-node-container-root-1')

    fireEvent.click(screen.getByTestId('domain-map-graph-node-child-1'))

    const rootNodeAfter = screen.getByTestId('domain-map-graph-node-container-root-1')

    expect(rootNodeAfter).toBe(rootNodeBefore)
  })
})
