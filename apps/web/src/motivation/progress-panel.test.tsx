// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { heatLevel } from './progress-heatmap'
import { ProgressPanelView } from './progress-panel'
import { progressView } from './test-mocks'

afterEach(cleanup)

describe('heatLevel', () => {
  it('should leave days without reviews empty', () => {
    expect(heatLevel(0, 20)).toBe(0)
  })

  it('should scale busy days relative to the busiest day', () => {
    expect(heatLevel(20, 20)).toBe(4)
    expect(heatLevel(1, 20)).toBe(1)
  })
})

describe('ProgressPanelView', () => {
  it('should lead with cards made solid and retention of older cards', () => {
    render(<ProgressPanelView progress={progressView()} />)

    expect(screen.getByTestId('progress-solid-week').textContent).toBe('This week you made 4 cards solid.')
    expect(screen.getByTestId('progress-retention').textContent).toContain('88%')
  })

  it('should not invent a retention number without older reviews', () => {
    render(<ProgressPanelView progress={progressView({ retentionOlderCards: null, retentionSample: 0, solidThisWeek: 0 })} />)

    expect(screen.getByTestId('progress-retention').textContent).toContain('shows once you review')
    expect(screen.getByTestId('progress-solid-week').textContent).toBe('No cards became solid yet this week.')
  })

  it('should draw one heatmap cell per day', () => {
    render(<ProgressPanelView progress={progressView()} />)

    expect(screen.getAllByTestId('heatmap-day')).toHaveLength(3)
    expect(screen.getAllByTestId('heatmap-day')[2]!.getAttribute('data-level')).toBe('4')
  })

  it('should show how much of each subject is solid, skipping subjects without cards', () => {
    const base = progressView().subjects[0]!

    render(
      <ProgressPanelView
        progress={progressView({ subjects: [base, { ...base, subjectId: 's2', subjectName: 'Empty', totalCards: 0, masteredCards: 0, percent: 0 }] })}
      />,
    )

    expect(screen.getAllByTestId('subject-mastery-row')).toHaveLength(1)
    expect(screen.getByRole('progressbar', { name: 'Math solid' }).getAttribute('aria-valuenow')).toBe('40')
    expect(screen.getByText('4 of 10 solid')).toBeTruthy()
  })
})
