import { describe, expect, it } from 'vitest'

import type { CoverageArea } from '@post-anki/shared'

import { buildCoverageGrid } from './coverage-grid'

function area(overrides: Partial<CoverageArea> & { domainNodeId: string }): CoverageArea {
  return {
    name: 'Hooks',
    subjectName: 'React',
    percent: 50,
    status: 'progress',
    ...overrides,
  }
}

describe('buildCoverageGrid', () => {
  it('produces sorted, deduped subject and area axes', () => {
    const grid = buildCoverageGrid([
      area({ domainNodeId: '1', subjectName: 'React', name: 'Hooks' }),
      area({ domainNodeId: '2', subjectName: 'Node.js', name: 'Streams' }),
      area({ domainNodeId: '3', subjectName: 'React', name: 'Routing' }),
    ])

    expect(grid.subjectNames).toEqual(['Node.js', 'React'])
    expect(grid.areaNames).toEqual(['Hooks', 'Routing', 'Streams'])
  })

  it('indexes each Area cell by its subject and area name', () => {
    const hooks = area({ domainNodeId: '1', subjectName: 'React', name: 'Hooks', percent: 70 })
    const grid = buildCoverageGrid([hooks])

    expect(grid.cellsBySubjectAndArea.React?.Hooks).toEqual(hooks)
  })

  it('produces empty axes for an empty coverage report, without erroring', () => {
    const grid = buildCoverageGrid([])

    expect(grid.subjectNames).toEqual([])
    expect(grid.areaNames).toEqual([])
  })
})
