// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { StreakCardView } from './streak-card'
import { goalStreak, todayView } from './test-mocks'

afterEach(cleanup)

describe('StreakCardView', () => {
  it('should show the running streak and what is left to count today', () => {
    render(<StreakCardView today={todayView()} onPause={vi.fn()} />)

    expect(screen.getByTestId('streak-headline').textContent).toBe('5 days in a row')
    expect(screen.getByTestId('streak-today').textContent).toBe('2 of 5 reviews to count today')
  });

  it('should tell the learner the day is done and extra is optional once the goal is met', () => {
    render(<StreakCardView today={todayView({ dayQualified: true, reviewsDone: 30 })} onPause={vi.fn()} />)

    expect(screen.getByTestId('streak-today').textContent).toContain('More is optional')
  })

  it('should name the daily goal when that is what counts', () => {
    render(<StreakCardView today={todayView({ thresholdIsGoal: true, threshold: 25 })} onPause={vi.fn()} />)

    expect(screen.getByTestId('streak-today').textContent).toBe('2 of 25 reviews for your daily goal')
  })

  it('should show the best streak and a welcome-back line instead of a zero when broken', () => {
    const streak = goalStreak({ status: 'broken', current: 0, longest: 9, comeback: true, previousStreak: 5 })

    render(<StreakCardView today={todayView({ streak })} onPause={vi.fn()} />)

    expect(screen.getByTestId('streak-headline').textContent).toBe('Best: 9 days. Start a new run today.')
    expect(screen.getByTestId('streak-note').textContent).toContain('Welcome back')
  })

  it('should show the rolling active days and rest days left', () => {
    render(<StreakCardView today={todayView()} onPause={vi.fn()} />)

    expect(screen.getByTestId('streak-extras').textContent).toBe('20 active days in the last 30 · 2 rest days left this month')
  })

  it('should offer a one-week pause that can be ended', () => {
    const onPause = vi.fn()
    const { rerender } = render(<StreakCardView today={todayView()} onPause={onPause} />)

    fireEvent.click(screen.getByTestId('streak-pause'))
    expect(onPause).toHaveBeenLastCalledWith(7)

    rerender(<StreakCardView today={todayView({ streak: goalStreak({ status: 'paused', pausedUntil: '2090-03-14' }) })} onPause={onPause} />)
    fireEvent.click(screen.getByTestId('streak-resume'))

    expect(onPause).toHaveBeenLastCalledWith(0)
    expect(screen.getByTestId('streak-note').textContent).toContain('Your streak is safe')
  })
})
