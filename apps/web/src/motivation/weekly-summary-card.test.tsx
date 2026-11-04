// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}))

import { WeeklySummaryCardView } from './weekly-summary-card'
import { weeklySummary } from './test-mocks'

afterEach(cleanup)

describe('WeeklySummaryCardView', () => {
  it('should compare this week with last week quietly', () => {
    render(<WeeklySummaryCardView summary={weeklySummary()} />)

    expect(screen.getByTestId('weekly-summary-compare').textContent).toBe('20 fewer than last week · 7 cards made solid')
  })

  it('should show focus subjects met', () => {
    render(<WeeklySummaryCardView summary={weeklySummary()} />)

    expect(screen.getByTestId('weekly-summary-focus').textContent).toBe('Focus: 1 of 2 met')
  })

  it('should prompt to pick next week only when none are picked', () => {
    const { rerender } = render(<WeeklySummaryCardView summary={weeklySummary()} />)

    expect(screen.getByTestId('weekly-summary-prompt').textContent).toContain('2090-W11')

    rerender(<WeeklySummaryCardView summary={weeklySummary({ needsNextWeekPriorities: false })} />)

    expect(screen.queryByTestId('weekly-summary-prompt')).toBeNull()
  })

  it('should hide the focus line when no focus subjects are set', () => {
    render(<WeeklySummaryCardView summary={weeklySummary({ focusTotal: 0, focusMet: 0 })} />)

    expect(screen.queryByTestId('weekly-summary-focus')).toBeNull()
  })
})
