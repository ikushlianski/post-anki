import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./stats.api', () => ({ getLearningStats: vi.fn(), getAiSpend: vi.fn() }))
vi.mock('../analytics/analytics.api', () => ({ getReviewStatistics: vi.fn() }))
vi.mock('../knowledge-bit/knowledge-browser.api', () => ({
  listKnowledgeBrowserSubjectCounts: vi.fn().mockResolvedValue({ ok: true, counts: [] }),
}))

import { getReviewStatistics } from '../analytics/analytics.api'
import { getAiSpend, getLearningStats } from './stats.api'
import { emptyLearningFixture, emptySpendFixture, learningFixture, spendFixture } from './stats.fixtures'
import { StatsPage } from './stats-page'
import { monthToDateSpend } from './stats-tiles'

describe('StatsPage', () => {
  beforeEach(() => {
    vi.mocked(getLearningStats).mockReset()
    vi.mocked(getAiSpend).mockReset()
    vi.mocked(getReviewStatistics).mockReset()
    vi.mocked(getReviewStatistics).mockRejectedValue(new Error('x'))
  })

  it('should show streak, 7-day accuracy and reviews today tiles', () => {
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    expect(screen.getByTestId('tile-streak').textContent).toBe('4 / 11 days')
    expect(screen.getByTestId('tile-accuracy').textContent).toBe('90%')
    expect(screen.getByTestId('tile-reviews-today').textContent).toBe('12')
  })

  it('should show a dash for accuracy and zeros for a brand new user', () => {
    render(<StatsPage initial={{ learning: emptyLearningFixture, spend: emptySpendFixture }} initialDays={30} />)

    expect(screen.getByTestId('tile-accuracy').textContent).toBe('–')
    expect(screen.getByTestId('tile-reviews-today').textContent).toBe('0')
  })

  it('should label the environment so dev and prod are not confused', () => {
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    expect(screen.getByTestId('env-badge').textContent).toBe('development')
  })

  it('should reload both datasets for the chosen range', async () => {
    vi.mocked(getLearningStats).mockResolvedValue({ ...learningFixture, streak: { current: 9, longest: 11 } })
    vi.mocked(getAiSpend).mockResolvedValue(spendFixture)
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    fireEvent.click(screen.getByTestId('range-90'))

    await waitFor(() => expect(screen.getByTestId('tile-streak').textContent).toBe('9 / 11 days'))
    expect(vi.mocked(getLearningStats)).toHaveBeenCalledWith({ data: expect.objectContaining({ days: 90 }) })
    expect(vi.mocked(getAiSpend)).toHaveBeenCalledWith({ data: expect.objectContaining({ days: 90 }) })
    expect(screen.getByTestId('range-90').getAttribute('aria-pressed')).toBe('true')
  })

  it('should announce a failed range, keep the old range pressed and retry that range', async () => {
    vi.mocked(getLearningStats).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(getAiSpend).mockResolvedValue(spendFixture)
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    fireEvent.click(screen.getByTestId('range-90'))

    expect((await screen.findByTestId('stats-error')).getAttribute('role')).toBe('alert')
    expect(screen.getByTestId('range-30').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('range-90').getAttribute('aria-pressed')).toBe('false')

    vi.mocked(getLearningStats).mockResolvedValue({ ...learningFixture, streak: { current: 9, longest: 11 } })
    fireEvent.click(screen.getByTestId('stats-retry'))

    await waitFor(() => expect(screen.getByTestId('range-90').getAttribute('aria-pressed')).toBe('true'))
    expect(screen.queryByTestId('stats-error')).toBeNull()
  })

  it('should tell the user when a range fails to load', async () => {
    vi.mocked(getLearningStats).mockRejectedValue(new Error('boom'))
    vi.mocked(getAiSpend).mockResolvedValue(spendFixture)
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    fireEvent.click(screen.getByTestId('range-365'))

    await waitFor(() => expect(screen.getByTestId('stats-error')).toBeTruthy())
  })
})

describe('monthToDateSpend', () => {
  it('should sum only days in the current month', () => {
    const total = monthToDateSpend(
      { ...spendFixture, days: [{ date: '2026-09-30', cardsUsd: 5, chatUsd: 0, otherUsd: 0 }, ...spendFixture.days] },
      new Date(2026, 9, 29),
    )

    expect(total).toBeCloseTo(0.66)
  })

  it('should show the cards due over the next 7 days', async () => {
    vi.mocked(getReviewStatistics).mockResolvedValue({
      forecast: { overdue: 4, days: [{ date: '2026-03-10', count: 2 }, { date: '2026-03-11', count: 3 }] },
    } as never)
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    expect((await screen.findByTestId('forecast-overdue')).textContent).toBe('4')
    expect(vi.mocked(getReviewStatistics)).toHaveBeenCalledWith({
      data: expect.objectContaining({ forecastDays: 7 }),
    })
  })

  it('should say when the forecast cannot be loaded', async () => {
    vi.mocked(getReviewStatistics).mockRejectedValue(new Error('x'))
    render(<StatsPage initial={{ learning: learningFixture, spend: spendFixture }} initialDays={30} />)

    expect((await screen.findByTestId('stats-due-forecast-error')).getAttribute('role')).toBe('alert')
  })
})
