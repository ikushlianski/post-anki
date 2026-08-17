// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { WeeklyDigest } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

import { WeeklyDigestPanel } from './weekly-digest-panel'

afterEach(cleanup)

function digest(overrides: Partial<WeeklyDigest> = {}): WeeklyDigest {
  return {
    windowDays: 7,
    timeToMastery: null,
    retention: null,
    coverage: [],
    concerns: [],
    streak: { currentStreak: 3, longestStreak: 5, lastActiveDate: '2026-08-08' },
    ...overrides,
  }
}

describe('WeeklyDigestPanel', () => {
  it('never claims a week-over-week improvement anywhere in its text', () => {
    render(<WeeklyDigestPanel digest={digest()} />)

    expect(screen.queryByText(/improved|since last week|% better/i)).toBeNull()
  })

  it('shows only concerns that are still open', () => {
    render(
      <WeeklyDigestPanel
        digest={digest({
          concerns: [
            { concern: 'security', open: 2, covered: 1, total: 3 },
            { concern: 'cost', open: 0, covered: 4, total: 4 },
          ],
        })}
      />,
    )

    const concernsSection = screen.getByTestId('weekly-digest-concerns')

    expect(concernsSection.textContent).toMatch(/Security/)
    expect(concernsSection.textContent).not.toMatch(/Cost/)
  })

  it('shows the current streak', () => {
    render(<WeeklyDigestPanel digest={digest({ streak: { currentStreak: 1, longestStreak: 1, lastActiveDate: null } })} />)

    expect(screen.getByText('1 day')).toBeTruthy()
  })
})
