// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { StudyForecast } from '@post-anki/shared'

vi.mock('./study-forecast.api', () => ({
  getStudyForecast: vi.fn(),
  browserTimeZone: () => 'UTC',
}))

import { StudyForecastCompact, SubjectForecastLoader } from './study-forecast-compact'
import { getStudyForecast } from './study-forecast.api'
import { emptyForecast, examForecast } from './test-mocks'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const withDays = (reviews: number[]): StudyForecast => ({
  ...examForecast,
  days: reviews.map((count, index) => ({ date: `2026-11-0${index + 1}`, reviews: count, newCards: 0 })),
})

function renderLoader() {
  const client = new QueryClient()

  render(
    <QueryClientProvider client={client}>
      <SubjectForecastLoader subjectId="subj_1" />
    </QueryClientProvider>,
  )
}

describe('StudyForecastCompact', () => {
  it('should list the next five days after today with their due reviews', () => {
    render(<StudyForecastCompact forecast={withDays([30, 4, 0, 7, 1, 9, 50])} />)

    expect(screen.getByTestId('study-forecast-compact-2026-11-02').textContent).toBe('Mon 2 Nov: 4 reviews')
    expect(screen.getByTestId('study-forecast-compact-2026-11-05').textContent).toContain('1 review')
    expect(screen.queryByTestId('study-forecast-compact-2026-11-01')).toBeNull()
    expect(screen.queryByTestId('study-forecast-compact-2026-11-03')).toBeNull()
    expect(screen.queryByTestId('study-forecast-compact-2026-11-07')).toBeNull()
  })

  it('should say nothing is due when the coming days are empty', () => {
    render(<StudyForecastCompact forecast={withDays([3, 0, 0, 0, 0, 0])} />)

    expect(screen.getByTestId('study-forecast-compact-empty').textContent).toBe('Nothing due in the next 5 days.')
  })

  it('should show nothing for a subject without cards', () => {
    render(<StudyForecastCompact forecast={{ ...emptyForecast, days: [] }} />)

    expect(screen.queryByTestId('study-forecast-compact')).toBeNull()
  })
})

describe('SubjectForecastLoader', () => {
  it('should show the forecast once it loads', async () => {
    vi.mocked(getStudyForecast).mockResolvedValue(withDays([3, 5, 0]))
    renderLoader()

    await waitFor(() => expect(screen.getByTestId('study-forecast-compact')).toBeTruthy())
    expect(getStudyForecast).toHaveBeenCalledWith({ data: { subjectId: 'subj_1', tz: 'UTC' } })
  })

  it('should render nothing while loading', () => {
    vi.mocked(getStudyForecast).mockReturnValue(new Promise(() => undefined))
    renderLoader()

    expect(screen.queryByTestId('study-forecast-compact')).toBeNull()
  })

  it('should render nothing when the request fails', async () => {
    vi.mocked(getStudyForecast).mockRejectedValue(new Error('boom'))
    renderLoader()

    await waitFor(() => expect(getStudyForecast).toHaveBeenCalled())
    expect(screen.queryByTestId('study-forecast-compact')).toBeNull()
  })
})
