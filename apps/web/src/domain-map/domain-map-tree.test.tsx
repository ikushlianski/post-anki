// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { DomainMapTree } from './domain-map-tree'

// separate-progress-overlay-from-structure (issue #85), SCENARIO 2/3/4/6 —
// mocking follows this repo's own precedent
// (apps/web/src/curriculum/tag-picker.test.tsx): CreateCurriculumForm and
// MergeDomainNodeButton both call useRouter() unconditionally on every
// render, so the tree cannot mount in a test without stubbing
// '@tanstack/react-router'. domain-map.api.ts and curriculum.api.ts are
// stubbed too, since TargetDepthControl/MergeDomainNodeButton/
// CreateCurriculumForm import mutation functions from them at module load
// time.
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
}))

vi.mock('./domain-map.api', () => ({
  setDomainNodeTargetDepth: vi.fn(),
  mergeDomainNodes: vi.fn(),
}))

vi.mock('../curriculum/curriculum.api', () => ({
  createCurriculum: vi.fn(),
}))

function makeNode(overrides: Partial<DomainNodeTreeItem> = {}): DomainNodeTreeItem {
  return {
    id: 'dnode-1',
    subjectId: 'sub-1',
    parentId: null,
    name: 'Networking',
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
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('DomainMapTree gap badge', () => {
  it('renders the gap badge for a node with zero percent', () => {
    const node = makeNode({ id: 'gap-node', percent: 0 })

    render(<DomainMapTree subjectId="sub-1" nodes={[node]} requireSources={false} />)

    expect(screen.getByTestId('domain-map-node-gap-badge-gap-node')).toBeDefined()
  })

  it('does not render the gap badge for a node with nonzero percent', () => {
    const node = makeNode({ id: 'progress-node', percent: 30 })

    render(<DomainMapTree subjectId="sub-1" nodes={[node]} requireSources={false} />)

    expect(screen.queryByTestId('domain-map-node-gap-badge-progress-node')).toBeNull()
  })

  it('still renders the "add course here" control for a gap node, unchanged', () => {
    const node = makeNode({ id: 'gap-node', percent: 0 })

    render(<DomainMapTree subjectId="sub-1" nodes={[node]} requireSources={false} />)

    expect(screen.getByTestId('domain-map-add-course-gap-node')).toBeDefined()
  })

  it('renders name, description and children identically regardless of mastery', () => {
    const child = makeNode({ id: 'child-node', name: 'Subnetting', percent: 0 })
    const node = makeNode({
      id: 'parent-node',
      name: 'Networking',
      description: 'Core networking concepts',
      percent: 45,
      children: [child],
    })

    render(<DomainMapTree subjectId="sub-1" nodes={[node]} requireSources={false} />)

    expect(screen.getByText('Networking')).toBeDefined()
    expect(screen.getByText('Core networking concepts')).toBeDefined()
    expect(screen.getByTestId('domain-map-node-child-node')).toBeDefined()
  })

  it('shows a gap badge on the uncovered child while the covered sibling stays badge-free, under the same parent', () => {
    const coveredChild = makeNode({ id: 'covered-child', name: 'Covered', percent: 80 })
    const uncoveredChild = makeNode({ id: 'uncovered-child', name: 'Uncovered', percent: 0 })
    const parent = makeNode({
      id: 'mixed-parent',
      name: 'Mixed Parent',
      percent: 40,
      children: [coveredChild, uncoveredChild],
    })

    render(<DomainMapTree subjectId="sub-1" nodes={[parent]} requireSources={false} />)

    expect(screen.queryByTestId('domain-map-node-gap-badge-mixed-parent')).toBeNull()
    expect(screen.queryByTestId('domain-map-node-gap-badge-covered-child')).toBeNull()
    expect(screen.getByTestId('domain-map-node-gap-badge-uncovered-child')).toBeDefined()
  })
})
