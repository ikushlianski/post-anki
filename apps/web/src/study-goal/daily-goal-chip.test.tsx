// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DailyGoalChip } from './daily-goal-chip'

afterEach(cleanup)

const base = { dayEndsAt: '2090-03-11T00:00:00.000Z' }

describe('DailyGoalChip', () => {
  it('should show nothing when the learner has not set a daily goal', () => {
    render(<DailyGoalChip progress={{ ...base, target: null, doneToday: 12 }} />)

    expect(screen.queryByTestId('daily-goal-chip')).toBeNull()
  })

  it('should show reviews done against the goal while it is still open', () => {
    render(<DailyGoalChip progress={{ ...base, target: 50, doneToday: 34 }} />)

    expect(screen.getByTestId('daily-goal-chip').textContent).toBe('Today: 34 of 50')
    expect(screen.getByTestId('daily-goal-chip').getAttribute('data-met')).toBe('false')
  })

  it('should say the goal is met once the target is reached or passed', () => {
    render(<DailyGoalChip progress={{ ...base, target: 50, doneToday: 61 }} />)

    expect(screen.getByTestId('daily-goal-chip').textContent).toBe('Today: 61 of 50 · goal met')
    expect(screen.getByTestId('daily-goal-chip').getAttribute('data-met')).toBe('true')
  })

  it('should show nothing before the progress has loaded', () => {
    render(<DailyGoalChip progress={null} />)

    expect(screen.queryByTestId('daily-goal-chip')).toBeNull()
  })
})
