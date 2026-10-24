// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SessionCelebration } from './session-celebration'

afterEach(cleanup)

describe('SessionCelebration', () => {
  it('should stay hidden when the session earned no points', () => {
    render(<SessionCelebration pointsEarned={0} leveledUp={false} level={null} />)

    expect(screen.queryByTestId('session-celebration')).toBeNull()
  })

  it('should show the points earned this session', () => {
    render(<SessionCelebration pointsEarned={12} leveledUp={false} level={null} />)

    expect(screen.getByRole('status').textContent).toContain('+12 points this session')
    expect(screen.queryByTestId('session-celebration-level')).toBeNull()
  })

  it('should announce the new level when the session crossed a level', () => {
    render(<SessionCelebration pointsEarned={12} leveledUp level={3} />)

    expect(screen.getByTestId('session-celebration-level').textContent).toBe('Level 3 reached')
  })
})
