// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TodayView } from '@post-anki/shared'

vi.mock('./motivation.api')

import { getMotivationToday } from './motivation.api'
import { GoalProgressChip } from './goal-progress-chip'

const today: TodayView = {
  date: '2026-10-28',
  reviewsDone: 4,
  threshold: 10,
  thresholdIsGoal: true,
  dayQualified: false,
  streak: {
    status: 'active',
    current: 5,
    longest: 9,
    restDaysLeft: 2,
    pausedUntil: null,
    comeback: false,
    previousStreak: 0,
    activeDaysLast30: 12,
  },
}

afterEach(cleanup)

describe('GoalProgressChip', () => {
  it('should show the running streak and how far today is toward the daily goal', async () => {
    vi.mocked(getMotivationToday).mockResolvedValue(today)
    render(<GoalProgressChip />)

    const chip = await screen.findByTestId('goal-progress-chip')

    expect(chip.textContent).toBe('5 days streak · 4 of 10 today')
  })

  it('should say the goal is done once today qualifies', async () => {
    vi.mocked(getMotivationToday).mockResolvedValue({ ...today, dayQualified: true, reviewsDone: 10 })
    render(<GoalProgressChip />)

    expect((await screen.findByTestId('goal-progress-chip')).textContent).toContain('Goal done today')
  })

  it('should show only today progress when there is no streak yet', async () => {
    vi.mocked(getMotivationToday).mockResolvedValue({
      ...today,
      streak: { ...today.streak, status: 'none', current: 0 },
    })
    render(<GoalProgressChip />)

    expect((await screen.findByTestId('goal-progress-chip')).textContent).toBe('4 of 10 today')
  })

  it('should show nothing when progress cannot be loaded', async () => {
    vi.mocked(getMotivationToday).mockRejectedValue(new Error('down'))
    render(<GoalProgressChip />)

    await vi.waitFor(() => expect(getMotivationToday).toHaveBeenCalled())

    expect(screen.queryByTestId('goal-progress-chip')).toBeNull()
  })
})
