import { describe, expect, it } from 'vitest'

import type { Milestone } from '@post-anki/shared'

import { sortMilestonesNewestFirst } from './sort-milestones'

function milestone(overrides: Partial<Milestone>): Milestone {
  return {
    id: 'm1',
    entityType: 'curriculum',
    entityId: 'curriculum-1',
    entityLabel: 'React Effects & Synchronization',
    criteriaKey: 'full_mastery',
    achievedAt: '2026-08-01T00:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortMilestonesNewestFirst', () => {
  it('should order the most recently achieved milestone first', () => {
    const sorted = sortMilestonesNewestFirst([
      milestone({ id: 'old', achievedAt: '2026-01-01T00:00:00.000Z' }),
      milestone({ id: 'new', achievedAt: '2026-08-01T00:00:00.000Z' }),
      milestone({ id: 'mid', achievedAt: '2026-04-01T00:00:00.000Z' }),
    ])

    expect(sorted.map((m) => m.id)).toEqual(['new', 'mid', 'old'])
  })

  it('should not mutate the input array', () => {
    const input = [milestone({ id: 'a' }), milestone({ id: 'b' })]
    const inputCopy = [...input]

    sortMilestonesNewestFirst(input)

    expect(input).toEqual(inputCopy)
  })
})
