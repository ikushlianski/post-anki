import { describe, expect, it } from 'vitest'

import type { Subject } from '../curriculum/model'
import {
  buildMoveOptions,
  countDirectSubSubjects,
  filterMoveOptions,
} from './subject-menu-model'

function subject(id: string, name: string, parentId: string | null): Subject {
  return {
    id,
    name,
    kind: 'architecture-mentor',
    requireSources: false,
    modelTier: null,
    parentId,
  }
}

const TREE: Subject[] = [
  subject('business', 'Business', null),
  subject('sales', 'Sales', 'business'),
  subject('health', 'Health', null),
  subject('fitness', 'Fitness', 'health'),
  subject('arts', 'Arts', null),
]

describe('buildMoveOptions', () => {
  it('should list the subjects in nested order with each depth and path', () => {
    const options = buildMoveOptions('sales', 'business', TREE)

    expect(options.map((option) => [option.name, option.depth, option.path])).toEqual([
      ['Arts', 0, 'Arts'],
      ['Business', 0, 'Business'],
      ['Health', 0, 'Health'],
      ['Fitness', 1, 'Health › Fitness'],
    ])
  })

  it('should exclude the subject itself and all of its descendants', () => {
    const options = buildMoveOptions('business', null, TREE)

    expect(options.map((option) => option.parentId)).toEqual(['arts', 'health', 'fitness'])
  })

  it('should mark only the current parent as current', () => {
    const options = buildMoveOptions('fitness', 'health', TREE)

    expect(options.filter((option) => option.isCurrent).map((option) => option.parentId)).toEqual([
      'health',
    ])
  })

  it('should show no option as current when the subject is at the top level', () => {
    const options = buildMoveOptions('sales', null, TREE)

    expect(options.some((option) => option.isCurrent)).toBe(false)
  })
})

describe('filterMoveOptions', () => {
  it('should keep only the options whose path contains the query, ignoring case', () => {
    const options = buildMoveOptions('sales', 'business', TREE)

    expect(filterMoveOptions(options, ' FIT ').map((option) => option.parentId)).toEqual([
      'fitness',
    ])
  })

  it('should return every option when the query is blank', () => {
    const options = buildMoveOptions('sales', 'business', TREE)

    expect(filterMoveOptions(options, '   ')).toEqual(options)
  })
})

describe('countDirectSubSubjects', () => {
  it('should count only the direct children of the subject', () => {
    const withGrandchild = [...TREE, subject('deep', 'Deep', 'fitness')]

    expect(countDirectSubSubjects('business', withGrandchild)).toBe(1)
    expect(countDirectSubSubjects('health', withGrandchild)).toBe(1)
    expect(countDirectSubSubjects('arts', withGrandchild)).toBe(0)
  })
})
