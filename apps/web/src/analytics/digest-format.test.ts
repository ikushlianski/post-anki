import { describe, expect, it } from 'vitest'

import type { CoverageReport } from '@post-anki/shared'

import { averageCoveragePercent, formatRetention, formatTimeToMastery } from './digest-format'

describe('formatTimeToMastery', () => {
  it('reads as "limited data" rather than a false zero when there is nothing to aggregate', () => {
    expect(formatTimeToMastery(null)).toBe('No data yet')
    expect(formatTimeToMastery({ count: 0, avgHours: 0, medianHours: 0 })).toBe('No data yet')
  })

  it('formats a real aggregate with hours and a mastered count', () => {
    expect(formatTimeToMastery({ count: 3, avgHours: 12.4, medianHours: 10 })).toBe(
      '12.4h avg · 3 mastered',
    )
  })
})

describe('formatRetention', () => {
  it('reads as "limited data" rather than 0% when there are no post-mastery answers', () => {
    expect(formatRetention(null)).toBe('No data yet')
  })

  it('formats a real aggregate as a rounded percent', () => {
    expect(formatRetention({ count: 4, avgRate: 0.875, medianRate: 0.9 })).toBe('88% avg · 4 gaps')
  })
})

describe('averageCoveragePercent', () => {
  it('returns null for an empty coverage report rather than dividing by zero', () => {
    expect(averageCoveragePercent([])).toBeNull()
  })

  it('averages percent across every Area', () => {
    const coverage: CoverageReport = [
      { domainNodeId: '1', name: 'Hooks', subjectName: 'React', percent: 80, status: 'progress' },
      { domainNodeId: '2', name: 'Streams', subjectName: 'Node.js', percent: 20, status: 'progress' },
    ]

    expect(averageCoveragePercent(coverage)).toBe(50)
  })
})
