import { useRef, useState } from 'react'

import { browserTimeZone } from '../shared/browser-time-zone'
import { AiSpendChart } from './ai-spend-chart'
import { DailyReviewsChart } from './daily-reviews-chart'
import { HourlyHistogram } from './hourly-histogram'
import { getAiSpend, getLearningStats } from './stats.api'
import { RANGE_OPTIONS, type AiSpend, type LearningStats } from './stats.types'
import { StatsCardMaturity } from './stats-card-maturity'
import { StatsDueForecast } from './stats-due-forecast'
import { StatsTriageByModel } from './stats-triage-by-model'
import { StatsTiles, monthToDateSpend } from './stats-tiles'

interface StatsData {
  learning: LearningStats
  spend: AiSpend
}

export function EnvBadge({ env }: { env: string }) {
  const isProd = env === 'production' || env === 'prod'

  return (
    <span
      data-testid="env-badge"
      className={`rounded px-2 py-0.5 text-xs font-medium ${isProd ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}
    >
      {env}
    </span>
  )
}

export function StatsPage({ initial, initialDays }: { initial: StatsData; initialDays: number }) {
  const [days, setDays] = useState(initialDays)
  const [data, setData] = useState(initial)
  const [failedRange, setFailedRange] = useState<number | null>(null)

  const latestRequest = useRef(0)

  const changeRange = (next: number) => {
    const requestId = ++latestRequest.current

    setFailedRange(null)
    const query = { tz: browserTimeZone(), days: next }

    Promise.all([getLearningStats({ data: query }), getAiSpend({ data: query })])
      .then(([learning, spend]) => {
        if (requestId !== latestRequest.current) return

        setDays(next)
        setData({ learning, spend })
      })
      .catch(() => {
        if (requestId === latestRequest.current) setFailedRange(next)
      })
  }

  return (
    <div data-testid="stats-page" className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <EnvBadge env={data.learning.env} />
        <div role="group" aria-label="Range" className="flex gap-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              data-testid={`range-${option}`}
              aria-pressed={days === option}
              onClick={() => changeRange(option)}
              className={`min-h-[44px] min-w-[44px] rounded-md border px-2 py-1 text-sm sm:min-h-0 sm:min-w-0 ${days === option ? 'border-neutral-800 bg-neutral-800 text-white' : 'border-neutral-300'}`}
            >
              {option} days
            </button>
          ))}
        </div>
        {failedRange !== null ? (
          <span role="alert" data-testid="stats-error" className="flex items-center gap-2 text-sm text-neutral-600">
            Couldn't load that range.
            <button
              type="button"
              data-testid="stats-retry"
              onClick={() => changeRange(failedRange)}
              className="rounded-md border border-neutral-300 px-2 py-1"
            >
              Retry
            </button>
          </span>
        ) : null}
      </div>

      <StatsTiles learning={data.learning} spend={data.spend} monthSpendUsd={monthToDateSpend(data.spend)} />

      <StatsCardMaturity />

      <StatsDueForecast />

      <section>
        <h2 className="mb-3 text-lg font-medium">Reviews per day</h2>
        <DailyReviewsChart days={data.learning.daily} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Reviews by hour of day</h2>
        <HourlyHistogram hourly={data.learning.hourly} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">AI spend</h2>
        <AiSpendChart spend={data.spend} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Fusion candidates kept and rejected by model</h2>
        <StatsTriageByModel rows={data.spend.triageByModel} />
      </section>
    </div>
  )
}
