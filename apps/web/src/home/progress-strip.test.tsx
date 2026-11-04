// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { StudyOverview } from '@post-anki/shared'

import { describeActivityDay } from './activity-calendar'
import { ProgressStrip } from './progress-strip'

afterEach(cleanup)

const OVERVIEW: StudyOverview = {
  counts: { new: 0, learning: 0, review: 0 },
  reviewedToday: 12,
  activity: [
    { date: '2026-10-19', count: 0 },
    { date: '2026-10-20', count: 12 },
    { date: '2026-10-21', count: 1 },
  ],
  nextDueAt: null,
  hasCards: true,
}

const STREAK = { currentStreak: 4, longestStreak: 12, lastActiveDate: '2026-10-21' }

describe('ProgressStrip', () => {
  it('should show reviewed today, current and best streak', () => {
    render(<ProgressStrip overview={{ ok: true, data: OVERVIEW }} streak={{ ok: true, data: STREAK }} />)

    expect(screen.getByTestId('reviewed-today').textContent).toBe('12')
    expect(screen.getByTestId('streak-current').textContent).toContain('4 days')
    expect(screen.getByTestId('streak-longest').textContent).toContain('Best 12 days')
  })

  it('should render one calendar cell per day with its review count readable without hovering', () => {
    render(<ProgressStrip overview={{ ok: true, data: OVERVIEW }} streak={{ ok: true, data: STREAK }} />)

    const cells = screen.getAllByTestId('activity-day')

    expect(cells).toHaveLength(3)
    expect(cells[1]!.getAttribute('aria-label')).toBe('12 reviews on Tue 20 Oct')
    expect(cells[0]!.getAttribute('aria-label')).toBe('0 reviews on Mon 19 Oct')
    expect(screen.getByText('13 reviews in the last 3 days')).toBeDefined()
  })

  it('should outline today as the last cell', () => {
    render(<ProgressStrip overview={{ ok: true, data: OVERVIEW }} streak={{ ok: true, data: STREAK }} />)

    const cells = screen.getAllByTestId('activity-day')

    expect(cells[2]!.className).toContain('ring-2')
    expect(cells[0]!.className).not.toContain('ring-2')
  })

  it('should keep the calendar usable when the streak fails to load', () => {
    render(<ProgressStrip overview={{ ok: true, data: OVERVIEW }} streak={{ ok: false }} />)

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your streak")
    expect(screen.getAllByTestId('activity-day')).toHaveLength(3)
  })

  it('should say so when the overview fails and still show the streak', () => {
    render(<ProgressStrip overview={{ ok: false }} streak={{ ok: true, data: STREAK }} />)

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load today's progress")
    expect(screen.getByTestId('streak-current')).toBeDefined()
  })
})

describe('describeActivityDay', () => {
  it('should use the singular for exactly one review', () => {
    expect(describeActivityDay({ date: '2026-10-26', count: 1 })).toBe('1 review on Mon 26 Oct')
  })
})
