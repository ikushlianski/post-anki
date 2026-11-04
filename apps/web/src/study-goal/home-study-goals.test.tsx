// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { SubjectPriority } from '@post-anki/shared'
import { HomeStudyGoalsView } from './home-study-goals'

afterEach(cleanup)

const daily = { target: 50, doneToday: 34, dayEndsAt: '2026-10-29T00:00:00.000Z' }

function priority(overrides: Partial<SubjectPriority>): SubjectPriority {
  return {
    id: 'p1',
    subjectId: 'pg',
    periodKind: 'week',
    periodKey: '2026-W44',
    title: 'Indexes',
    targetMetric: 'reviews',
    targetValue: 40,
    doneAt: null,
    progress: { reviews: 10, newCards: 0, notes: 0 },
    current: 10,
    targetMet: false,
    ...overrides,
  }
}

describe('HomeStudyGoalsView', () => {
  it('should render nothing for a learner who set no goals', () => {
    render(<HomeStudyGoalsView daily={{ ...daily, target: null }} priorities={[]} subjectNames={{}} />)

    expect(screen.queryByTestId('home-study-goals')).toBeNull()
  })

  it("should show today's progress against the daily goal", () => {
    render(<HomeStudyGoalsView daily={daily} priorities={[]} subjectNames={{}} />)

    expect(screen.getByTestId('daily-goal-chip').textContent).toBe('Today: 34 of 50')
    expect(screen.queryByTestId('home-week-priorities')).toBeNull()
  })

  it("should list this week's priorities with their subject and progress", () => {
    render(<HomeStudyGoalsView daily={null} priorities={[priority({})]} subjectNames={{ pg: 'Postgres' }} />)

    expect(screen.getByTestId('home-week-priority').textContent).toContain('Indexes')
    expect(screen.getByTestId('home-week-priority').textContent).toContain('Postgres')
    expect(screen.getByTestId('home-week-priority').textContent).toContain('10 of 40 reviews')
  })
})
