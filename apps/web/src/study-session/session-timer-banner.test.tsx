// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { SessionTimerBanner } from './session-timer-banner'

afterEach(cleanup)

describe('SessionTimerBanner', () => {
  it('shows elapsed and planned duration without a time-up notice before the duration elapses', () => {
    render(
      <SessionTimerBanner
        elapsedMinutes={5}
        plannedDurationMinutes={20}
        timeUp={false}
        ending={false}
        onEndNow={vi.fn()}
      />,
    )

    expect(screen.getByTestId('session-elapsed').textContent).toBe('5m')
    expect(screen.queryByTestId('session-time-up')).toBeNull()
  })

  it('shows a time-up notice once the planned duration has elapsed, without forcing an end', () => {
    render(
      <SessionTimerBanner
        elapsedMinutes={20}
        plannedDurationMinutes={20}
        timeUp
        ending={false}
        onEndNow={vi.fn()}
      />,
    )

    expect(screen.getByTestId('session-time-up')).toBeTruthy()
    expect(screen.getByTestId<HTMLButtonElement>('session-end-now').disabled).toBe(false)
  })

  it('calls onEndNow when the end button is clicked', () => {
    const onEndNow = vi.fn()

    render(
      <SessionTimerBanner
        elapsedMinutes={5}
        plannedDurationMinutes={20}
        timeUp={false}
        ending={false}
        onEndNow={onEndNow}
      />,
    )

    fireEvent.click(screen.getByTestId('session-end-now'))

    expect(onEndNow).toHaveBeenCalled()
  })
})
