import { describe, expect, it } from 'vitest'

import type { DomainNodeTreeItem } from '@post-anki/shared'

import { flattenDomainTree, indentedLabel } from './note-taxonomy-options'

function node(overrides: Partial<DomainNodeTreeItem>): DomainNodeTreeItem {
  return {
    id: 'n1',
    subjectId: 's1',
    parentId: null,
    name: 'Node',
    description: null,
    order: 0,
    percent: 0,
    targetDepth: null,
    priorityDistance: null,
    curricula: [],
    children: [],
    supersededAt: null,
    supersededReason: null,
    source: 'static_taxonomy',
    ...overrides,
  }
}

describe('flattenDomainTree', () => {
  it('should flatten a nested tree into depth-first, order-sorted options', () => {
    const tree = [
      node({
        id: 'b',
        name: 'Backend',
        order: 1,
        children: [node({ id: 'db', name: 'Databases', order: 0 })],
      }),
      node({ id: 'a', name: 'Frontend', order: 0 }),
    ]

    const options = flattenDomainTree(tree)

    expect(options.map((option) => option.id)).toEqual(['a', 'b', 'db'])
    expect(options.find((option) => option.id === 'db')?.depth).toBe(1)
  })

  it('should return an empty list for an empty tree', () => {
    expect(flattenDomainTree([])).toEqual([])
  })
})

describe('indentedLabel', () => {
  it('should indent nested options with a dash prefix per depth level', () => {
    expect(indentedLabel({ id: 'a', label: 'React', depth: 2 })).toBe('— — React')
  })

  it('should render a root option with no prefix', () => {
    expect(indentedLabel({ id: 'a', label: 'React', depth: 0 })).toBe('React')
  })
})
