// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { SessionClosureView } from './session-closure'
import { sessionSummary } from './test-mocks'

afterEach(cleanup)

describe('SessionClosureView', () => {
  it('should show done versus goal, the one improvement and tomorrow\'s preview', () => {
    render(<SessionClosureView summary={sessionSummary()} />)

    expect(screen.getByTestId('session-closure-goal').textContent).toBe('Goal met: 30 of 25 reviews')
    expect(screen.getByTestId('session-closure-solid').textContent).toBe('12 cards are now solid')
    expect(screen.getByTestId('session-closure-tomorrow').textContent).toBe('Tomorrow: 18 due, about 6 minutes')
  })

  it('should present extra reviews as a bonus rather than a new bar to chase', () => {
    render(<SessionClosureView summary={sessionSummary()} />)

    expect(screen.getByTestId('session-closure-bonus').textContent).toBe('5 bonus reviews beyond the goal')
  })

  it('should give a clear stopping point', () => {
    render(<SessionClosureView summary={sessionSummary()} />)

    expect(screen.getByTestId('session-closure-stop').textContent).toBe("You're done for today. More is optional.")
  })

  it('should show progress toward an unmet goal without pressure wording', () => {
    render(<SessionClosureView summary={sessionSummary({ goalMet: false, bonus: 0, doneToday: 10 })} />)

    expect(screen.getByTestId('session-closure-goal').textContent).toBe("10 of 25 reviews toward today's goal")
    expect(screen.queryByTestId('session-closure-bonus')).toBeNull()
  })

  it('should just count reviews when no goal is set and hide empty improvements', () => {
    render(<SessionClosureView summary={sessionSummary({ goalTarget: null, goalMet: false, bonus: 0, newlySolid: 0, tomorrowDue: 0, tomorrowMinutes: 0 })} />)

    expect(screen.getByTestId('session-closure-goal').textContent).toBe('30 reviews today')
    expect(screen.queryByTestId('session-closure-solid')).toBeNull()
    expect(screen.getByTestId('session-closure-tomorrow').textContent).toBe('Nothing is due tomorrow.')
  })

  it('should mention a long-gap recall in months once, and only when there is one', () => {
    const { rerender } = render(<SessionClosureView summary={sessionSummary()} />)

    expect(screen.queryByTestId('session-closure-surprise')).toBeNull()

    rerender(<SessionClosureView summary={sessionSummary({ surprise: { knowledgeBitId: 'k', gapDays: 200, subjectName: 'History' } })} />)

    expect(screen.getByTestId('session-closure-surprise').textContent).toContain('from History after 7 months away')
  })
})
