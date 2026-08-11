// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import type { CoverageReport, RetentionReport, WeeklyDigest } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: ReactNode }) => <a {...rest}>{children}</a>,
}))

import { AnalyticsDashboard } from './analytics-dashboard'

afterEach(cleanup)

describe('AnalyticsDashboard', () => {
  it('renders the digest, heat map, and mastery breakdown sections', () => {
    const digest: WeeklyDigest = {
      windowDays: 7,
      timeToMastery: null,
      retention: null,
      coverage: [],
      concerns: [],
      streak: { currentStreak: 0, longestStreak: 0, lastActiveDate: null },
    }
    const coverage: CoverageReport = []
    const retention: RetentionReport = {
      overall: null,
      timeToMasteryOverall: null,
      byTopic: [],
      byArea: [],
    }

    render(<AnalyticsDashboard digest={digest} coverage={coverage} retention={retention} />)

    expect(screen.getByTestId('weekly-digest-panel')).toBeTruthy()
    expect(screen.getByTestId('coverage-heat-map-empty')).toBeTruthy()
    expect(screen.getByTestId('mastery-breakdown-empty')).toBeTruthy()
  })
})
