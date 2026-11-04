// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReviewStatistics } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../analytics.api', () => ({ getReviewStatistics: vi.fn() }))
vi.mock('../../shared/browser-time-zone', () => ({ browserTimeZone: () => 'Europe/Berlin' }))
vi.mock('../../knowledge-bit/use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({
    options: [{ id: 'subj_1', label: 'Math' }],
    labelFor: () => 'Math',
  }),
}))

import { getReviewStatistics } from '../analytics.api'
import { ReviewStatisticsSection } from './review-statistics-section'

function statistics(overrides: Partial<ReviewStatistics> = {}): ReviewStatistics {
  return {
    forecast: { overdue: 3, days: [{ date: '2026-03-10', count: 2 }, { date: '2026-03-11', count: 0 }] },
    retention: {
      granularity: 'day',
      overallRate: 0.8,
      points: [{ date: '2026-03-09', total: 10, passed: 8, rate: 0.8 }],
    },
    answerButtons: { total: 10, counts: { again: 2, hard: 1, good: 5, easy: 2 } },
    range: { earliestReviewDate: '2026-01-02' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(getReviewStatistics).mockReset()
})

afterEach(cleanup)

describe('ReviewStatisticsSection', () => {
  it('should announce the loading text to screen readers', () => {
    vi.mocked(getReviewStatistics).mockReturnValue(new Promise(() => {}))
    render(<ReviewStatisticsSection subjectId={null} onSubjectChange={() => {}} />)

    expect(screen.getByText('Loading statistics...').getAttribute('role')).toBe('status')
  })

  it('should show the counts of Again, Hard, Good and Easy as text so figures are readable without the chart', async () => {
    vi.mocked(getReviewStatistics).mockResolvedValue(statistics())

    render(<ReviewStatisticsSection subjectId={null} onSubjectChange={() => {}} />)

    await waitFor(() => expect(screen.getByTestId('answer-buttons')).toBeTruthy())
    expect(screen.getByTestId('answer-button-again').textContent).toContain('2 (20%)')
    expect(screen.getByTestId('answer-button-good').textContent).toContain('5 (50%)')
    expect(screen.getByTestId('retention-overall').textContent).toBe('80%')
    expect(screen.getByTestId('forecast-overdue').textContent).toBe('3')
  })

  it('should show the empty message and a link to review when there are no reviews', async () => {
    vi.mocked(getReviewStatistics).mockResolvedValue(
      statistics({
        retention: { granularity: 'day', overallRate: null, points: [] },
        answerButtons: { total: 0, counts: { again: 0, hard: 0, good: 0, easy: 0 } },
        range: { earliestReviewDate: null },
      }),
    )

    render(<ReviewStatisticsSection subjectId={null} onSubjectChange={() => {}} />)

    await waitFor(() => expect(screen.getByTestId('statistics-no-reviews')).toBeTruthy())
    expect(screen.getByRole('link', { name: 'Start reviewing' }).getAttribute('href')).toBe('/knowledge/review')
  })

  it('should request statistics for the chosen subject and learner timezone', async () => {
    vi.mocked(getReviewStatistics).mockResolvedValue(statistics())

    render(<ReviewStatisticsSection subjectId="subj_1" onSubjectChange={() => {}} />)

    await waitFor(() => expect(getReviewStatistics).toHaveBeenCalled())
    expect(getReviewStatistics).toHaveBeenCalledWith({
      data: { tz: 'Europe/Berlin', subjectId: 'subj_1', forecastDays: 14, historyDays: 90 },
    })
  })

  it('should refetch when the history window changes', async () => {
    vi.mocked(getReviewStatistics).mockResolvedValue(statistics())

    render(<ReviewStatisticsSection subjectId={null} onSubjectChange={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('answer-buttons')).toBeTruthy())
    fireEvent.change(screen.getByTestId('statistics-history'), { target: { value: '0' } })

    await waitFor(() =>
      expect(getReviewStatistics).toHaveBeenLastCalledWith({
        data: { tz: 'Europe/Berlin', subjectId: undefined, forecastDays: 14, historyDays: 0 },
      }),
    )
  })

  it('should keep the page usable and offer a retry when statistics fail to load', async () => {
    vi.mocked(getReviewStatistics).mockRejectedValueOnce(new Error('boom')).mockResolvedValue(statistics())

    render(<ReviewStatisticsSection subjectId={null} onSubjectChange={() => {}} />)

    await waitFor(() => expect(screen.getByTestId('statistics-error')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByTestId('answer-buttons')).toBeTruthy())
  })
})
