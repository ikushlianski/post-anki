// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Badge } from '@post-anki/shared'

import { BadgeGrid } from './badge-grid'

const badge = (overrides: Partial<Badge>): Badge => ({
  key: 'streak-7',
  family: 'streak',
  name: 'One week',
  description: 'Study 7 days in a row',
  threshold: 7,
  progress: 7,
  unlocked: true,
  ...overrides,
})

afterEach(cleanup)

describe('BadgeGrid', () => {
  it('should mark earned badges as earned and show progress on locked ones', () => {
    render(
      <BadgeGrid
        badges={[badge({}), badge({ key: 'streak-30', name: 'One month', threshold: 30, progress: 12, unlocked: false })]}
      />,
    )

    expect(screen.getByTestId('badge-streak-7').getAttribute('data-unlocked')).toBe('true')
    expect(screen.getByTestId('badge-streak-7').textContent).toContain('Earned')
    expect(screen.getByTestId('badge-streak-30').getAttribute('data-unlocked')).toBe('false')
    expect(screen.getByTestId('badge-streak-30').textContent).toContain('12 of 30')
  })

  it('should say there are no badges instead of an empty grid', () => {
    render(<BadgeGrid badges={[]} />)

    expect(screen.getByText('No badges yet.')).toBeTruthy()
  })
})
