import { useCallback, useEffect, useState } from 'react'
import type { ReviewStatistics } from '@post-anki/shared'

import { getReviewStatistics } from '../analytics/analytics.api'
import { DueForecastChart } from '../analytics/review-statistics/due-forecast-chart'
import { browserTimeZone } from '../shared/browser-time-zone'

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; forecast: ReviewStatistics['forecast'] }

export function StatsDueForecast() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    setState({ status: 'loading' })
    getReviewStatistics({ data: { tz: browserTimeZone(), forecastDays: 7, historyDays: 7 } })
      .then((statistics) => active && setState({ status: 'ready', forecast: statistics.forecast }))
      .catch(() => active && setState({ status: 'error' }))

    return () => {
      active = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return (
    <section data-testid="stats-due-forecast">
      <h2 className="mb-3 text-lg font-medium">Due next 7 days</h2>
      {state.status === 'loading' ? (
        <p role="status" className="text-sm text-neutral-500">
          Loading...
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" data-testid="stats-due-forecast-error" className="text-sm text-neutral-600">
          Couldn't load the forecast.{' '}
          <button type="button" data-testid="stats-due-forecast-retry" className="underline" onClick={retry}>
            Retry
          </button>
        </p>
      ) : null}
      {state.status === 'ready' ? <DueForecastChart forecast={state.forecast} /> : null}
    </section>
  )
}
