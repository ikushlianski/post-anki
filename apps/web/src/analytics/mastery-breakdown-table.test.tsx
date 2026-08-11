// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { MasteryBreakdownTable } from './mastery-breakdown-table'

afterEach(cleanup)

describe('MasteryBreakdownTable', () => {
  it('shows a neutral empty state with no rows', () => {
    render(<MasteryBreakdownTable entries={[]} />)

    expect(screen.getByTestId('mastery-breakdown-empty')).toBeTruthy()
  })

  it('renders one row per entry with time-to-mastery and retention', () => {
    render(
      <MasteryBreakdownTable
        entries={[
          {
            key: 'React',
            timeToMastery: { count: 2, avgHours: 5, medianHours: 5 },
            retention: null,
          },
        ]}
      />,
    )

    expect(screen.getByText('React')).toBeTruthy()
    expect(screen.getByText('5.0h avg · 2 mastered')).toBeTruthy()
    expect(screen.getByText('No data yet')).toBeTruthy()
  })
})
