// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { RejectReasonWeek } from '@post-anki/shared'

import { RejectReasonsWeeklyTrend } from './reject-reasons-weekly-trend'

afterEach(cleanup)

const week = (weekStart: string, rejected: number, decided: number): RejectReasonWeek => ({
  weekStart,
  rejected,
  decided,
  rejectRate: decided === 0 ? 0 : rejected / decided,
  topReasons: [{ reasonCode: 'bad_format', count: rejected }],
})

describe('RejectReasonsWeeklyTrend', () => {
  it('should say there were no decisions when every week is empty', () => {
    render(<RejectReasonsWeeklyTrend weekly={[week('2026-10-19', 0, 0), week('2026-10-26', 0, 0)]} />)

    expect(screen.getByTestId('reject-trend-empty').textContent).toBe('No triage decisions in the last 12 weeks')
  })

  it('should show the latest reject rate against the previous week and describe the chart in text', () => {
    render(<RejectReasonsWeeklyTrend weekly={[week('2026-10-19', 5, 10), week('2026-10-26', 2, 10)]} />)

    expect(screen.getByTestId('reject-trend-label').textContent).toContain('20% (previous: 50%)')
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('2 of 10 rejected (20%)')
    expect(screen.getByTestId('reject-trend-table').textContent).toContain('Bad format')
  })

  it('should scroll the table sideways instead of widening the page', () => {
    render(<RejectReasonsWeeklyTrend weekly={[week('2026-10-19', 5, 10), week('2026-10-26', 2, 10)]} />)

    const scroll = screen.getByTestId('reject-trend-scroll')

    expect(scroll.className).toContain('overflow-x-auto')
    expect(scroll.contains(screen.getByTestId('reject-trend-table'))).toBe(true)
  })
})
