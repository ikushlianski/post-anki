// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { AnkiReviewSummary } from './anki-review-summary'
import type { SessionStats } from './anki-review-session-stats'

afterEach(cleanup)

const stats: SessionStats = {
  reviewed: 5,
  byGrade: { again: 1, hard: 0, good: 3, easy: 1 },
  recalledShare: 0.8,
  newStudied: 2,
  totalMs: 20000,
  averageMs: 4000,
  suspended: 0,
  buried: 0,
  leeches: 0,
  edited: 0,
  done: 5,
  remaining: 0,
  totalGradedToday: 5,
  pointsEarned: 0,
  leveledUp: false,
  levelReached: null,
}

describe('AnkiReviewSummary', () => {
  it('should hide Suspended, Buried, Edited and Leeches when they are zero', () => {
    render(<AnkiReviewSummary stats={stats} />)

    expect(screen.queryByText('Buried')).toBeNull()
    expect(screen.queryByText('Suspended')).toBeNull()
    expect(screen.queryByText('Edited')).toBeNull()
    expect(screen.queryByText('Leeches flagged')).toBeNull()
    expect(screen.getByText('Cards reviewed')).toBeTruthy()
    expect(screen.getByText('Hard')).toBeTruthy()
  })

  it('should show Buried when some cards were buried', () => {
    render(<AnkiReviewSummary stats={{ ...stats, buried: 2 }} />)

    expect(screen.getByTestId('anki-review-summary-buried').textContent).toBe('2')
  })
})
