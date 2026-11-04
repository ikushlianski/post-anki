// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { StudyOverview } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? {})} {...rest}>
      {children}
    </a>
  ),
}))

import { StudyNowCard } from './study-now-card'

afterEach(cleanup)

const BASE: StudyOverview = {
  counts: { new: 5, learning: 2, review: 9 },
  reviewedToday: 0,
  activity: [],
  nextDueAt: null,
  hasCards: true,
}

describe('StudyNowCard', () => {
  it('should show the three counts and a Study now button that opens the review page for everything', () => {
    render(<StudyNowCard overview={{ ok: true, data: BASE }} />)

    expect(screen.getByTestId('study-count-new').textContent).toBe('5')
    expect(screen.getByTestId('study-count-learning').textContent).toBe('2')
    expect(screen.getByTestId('study-count-due').textContent).toBe('9')

    const button = screen.getByTestId('study-now-button')

    expect(button.getAttribute('href')).toBe('/knowledge/review')
    expect(button.getAttribute('data-search')).toBe('{}')
  })

  it('should show All caught up with the next due time and no Study now button when nothing is due', () => {
    const nextDueAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

    render(
      <StudyNowCard
        overview={{
          ok: true,
          data: { ...BASE, counts: { new: 0, learning: 0, review: 0 }, nextDueAt },
        }}
      />,
    )

    expect(screen.getByText('All caught up')).toBeDefined()
    expect(screen.getByTestId('study-next-due').textContent).toBe('Next card due in 3 hours')
    expect(screen.queryByTestId('study-now-button')).toBeNull()
  })

  it('should point a learner with no cards to Add knowledge', () => {
    render(
      <StudyNowCard
        overview={{
          ok: true,
          data: { ...BASE, counts: { new: 0, learning: 0, review: 0 }, hasCards: false },
        }}
      />,
    )

    expect(screen.getByText('Add knowledge').getAttribute('href')).toBe('/add-knowledge')
    expect(screen.queryByTestId('study-now-button')).toBeNull()
    expect(screen.queryByText('All caught up')).toBeNull()
  })

  it('should show an inline message when the overview cannot load', () => {
    render(<StudyNowCard overview={{ ok: false }} />)

    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your review counts")
  })
})
